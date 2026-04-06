import os
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

app = FastAPI(title="Bandeja Video Processor", version="0.3.0")

DEFAULT_WEIGHTS = {
    "sceneChange":    0.20,
    "motionAnalysis": 0.25,
    "audioAnalysis":  0.35,
    "visionAnalysis": 0.20,
}


class SignalWeights(BaseModel):
    sceneChange:    float = 0.20
    motionAnalysis: float = 0.25
    audioAnalysis:  float = 0.35
    visionAnalysis: float = 0.20


class ProcessRequest(BaseModel):
    match_id: str
    video_path: str
    confidence_threshold: float = 0.7
    signal_weights: Optional[SignalWeights] = None


class ProcessResponse(BaseModel):
    match_id: str
    status: str
    message: str


class ExtractPlayersRequest(BaseModel):
    video_path: str


def get_firestore():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
        private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
        if not project_id or not client_email or not private_key:
            return None
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


@app.get("/health")
def health():
    return {"status": "ok", "service": "bandeja-processor"}


@app.post("/extract-players")
async def extract_players(req: ExtractPlayersRequest):
    """
    Extract 4 frames from the first ~30s of a match video.
    Samples one frame per ~7 seconds so you get good coverage of initial court positions.
    Returns base64 JPEG strings for each frame.
    """
    import cv2
    import base64

    cap = cv2.VideoCapture(req.video_path)
    if not cap.isOpened():
        return {"error": "Could not open video", "frames": []}

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    # Sample at 5s, 12s, 20s, 28s — these tend to show players at court positions
    sample_times = [5.0, 12.0, 20.0, 28.0]
    frames_b64 = []

    for t in sample_times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ret, frame = cap.read()
        if not ret:
            continue
        frame = cv2.resize(frame, (1280, 720))
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        frames_b64.append(base64.b64encode(buf.tobytes()).decode('utf-8'))

    cap.release()
    return {"frames": frames_b64}


@app.post("/process", response_model=ProcessResponse)
async def process_video(req: ProcessRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_detection_pipeline, req)
    return ProcessResponse(match_id=req.match_id, status="queued", message="Detection pipeline started")


async def run_detection_pipeline(req: ProcessRequest):
    from src.detection.scene_change import detect_scene_changes
    from src.detection.motion import analyze_motion
    from src.detection.audio import analyze_audio
    from src.detection.vision import analyze_with_vision
    from src.detection.assembler import assemble_points

    weights = req.signal_weights.model_dump() if req.signal_weights else DEFAULT_WEIGHTS
    print(f"[{req.match_id}] Using signal weights: {weights}")

    db = get_firestore()
    match_ref = db.collection("matches").document(req.match_id) if db else None

    def update_status(status: str, progress: int):
        print(f"[{req.match_id}] {status} ({progress}%)")
        if match_ref:
            from google.cloud.firestore import SERVER_TIMESTAMP
            match_ref.update({"status": status, "processingProgress": progress, "updatedAt": SERVER_TIMESTAMP})

    try:
        update_status("processing", 5)

        print(f"[{req.match_id}] Stage 1: Scene change detection")
        segments = detect_scene_changes(req.video_path)
        update_status("processing", 25)

        print(f"[{req.match_id}] Stage 2: Motion analysis ({len(segments)} segments)")
        segments = analyze_motion(req.video_path, segments)
        update_status("processing", 50)

        print(f"[{req.match_id}] Stage 3: Audio analysis")
        segments = analyze_audio(req.video_path, segments)
        update_status("processing", 70)

        print(f"[{req.match_id}] Stage 4: Claude Vision")
        segments = analyze_with_vision(req.video_path, segments, threshold=req.confidence_threshold)
        update_status("processing", 85)

        points = assemble_points(req.match_id, segments, weights=weights)
        print(f"[{req.match_id}] Detected {len(points)} points")

        # Stage 5: Winner detection via Claude Vision on last frames of each point
        from src.detection.winner import detect_winner
        print(f"[{req.match_id}] Stage 5: Winner detection")
        winner_results = {}
        for point in points:
            result = detect_winner(req.video_path, point.end_time)
            winner_results[point.id] = result
            status = "auto" if not result["needs_review"] else "needs_review"
            print(f"  Point #{point.point_number}: winner={result['winner']} conf={result['confidence']:.2f} [{status}]")

        if db and points:
            batch = db.batch()
            for point in points:
                wr = winner_results.get(point.id, {})
                ref = db.collection("points").document(point.id)
                batch.set(ref, {
                    "matchId": point.match_id,
                    "pointNumber": point.point_number,
                    "startTime": point.start_time,
                    "endTime": point.end_time,
                    "duration": point.duration,
                    "confidence": point.confidence,
                    "detectionSignals": point.detection_signals,
                    "status": "pending",
                    "winnerDetection": {
                        "winner": wr.get("winner"),
                        "confidence": wr.get("confidence", 0.0),
                        "reason": wr.get("reason", ""),
                        "needsReview": wr.get("needs_review", True),
                    },
                })
            batch.commit()
            match_ref.update({"status": "detected", "processingProgress": 100, "pointsDetected": len(points)})

        update_status("detected", 100)
        print(f"[{req.match_id}] Pipeline complete — {len(points)} points written")

    except Exception as e:
        print(f"[{req.match_id}] Pipeline FAILED: {e}")
        if match_ref:
            match_ref.update({"status": "error", "errorMessage": str(e)})
