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
    Find the frame with the most players visible, then return close-up crops
    of each detected player alongside the full reference frame.

    Response:
      frames       - list with the best full-court frame (base64 JPEG)
      player_crops - list of up to 4 close-up crops, one per detected player,
                     sorted left-to-right across the court
    """
    import cv2
    import base64

    cap = cv2.VideoCapture(req.video_path)
    if not cap.isOpened():
        return {"error": "Could not open video", "frames": [], "player_crops": []}

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    total_duration = total_frames / fps if total_frames > 0 else 3600.0

    # Start at 10 minutes in (or 10% of video, minimum 60s)
    start_time = max(60.0, min(600.0, total_duration * 0.10))
    end_time = min(total_duration * 0.80, start_time + 300.0)
    if end_time <= start_time:
        end_time = max(start_time + 10.0, total_duration - 10.0)

    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    num_candidates = 20
    step = (end_time - start_time) / max(num_candidates - 1, 1)
    candidate_times = [start_time + step * i for i in range(num_candidates)]

    best_frame = None
    best_rects_scaled = []   # rects in original frame coordinates
    best_count = 0

    for t in candidate_times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ret, frame = cap.read()
        if not ret:
            continue

        orig_h, orig_w = frame.shape[:2]
        small = cv2.resize(frame, (640, 360))
        rects, _ = hog.detectMultiScale(
            small, winStride=(8, 8), padding=(4, 4), scale=1.05,
        )

        if len(rects) > best_count:
            best_count = len(rects)
            best_frame = frame.copy()
            # Scale bounding boxes back to original resolution
            sx, sy = orig_w / 640.0, orig_h / 360.0
            best_rects_scaled = [
                (int(x * sx), int(y * sy), int(w * sx), int(h * sy))
                for (x, y, w, h) in rects
            ]
            if best_count >= 4:
                break  # good enough — all 4 players found

    cap.release()

    if best_frame is None:
        return {"error": "Could not read frames", "frames": [], "player_crops": []}

    orig_h, orig_w = best_frame.shape[:2]

    # --- Full reference frame ---
    frame_display = cv2.resize(best_frame, (1280, 720))
    _, buf = cv2.imencode('.jpg', frame_display, [cv2.IMWRITE_JPEG_QUALITY, 85])
    full_b64 = base64.b64encode(buf.tobytes()).decode('utf-8')

    # --- Player close-up crops ---
    # Sort left-to-right (x position) so Team 1 left / Team 2 right order is preserved
    best_rects_scaled.sort(key=lambda r: r[0])
    top4 = best_rects_scaled[:4]

    player_crops: list[str] = []
    for (x, y, w, h) in top4:
        # Generous padding: 50% horizontally, 25% vertically (shows shoulders/head clearly)
        pad_x = int(w * 0.5)
        pad_y = int(h * 0.25)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(orig_w, x + w + pad_x)
        y2 = min(orig_h, y + h + pad_y)

        crop = best_frame[y1:y2, x1:x2]
        # Portrait crop at fixed size so all thumbnails look uniform
        crop_resized = cv2.resize(crop, (220, 320))
        _, cbuf = cv2.imencode('.jpg', crop_resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
        player_crops.append(base64.b64encode(cbuf.tobytes()).decode('utf-8'))

    return {
        "frames": [full_b64],
        "player_crops": player_crops,
        "players_found": best_count,
    }


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
