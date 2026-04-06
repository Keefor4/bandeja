import os
import uuid
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Bandeja Video Processor", version="0.2.0")


class ProcessRequest(BaseModel):
    match_id: str
    video_path: str
    confidence_threshold: float = 0.7


class ProcessResponse(BaseModel):
    match_id: str
    status: str
    message: str


def get_firestore():
    """Lazy Firestore init so the app starts even without Firebase creds."""
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        if not project_id:
            return None
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": project_id})

    return firestore.client()


@app.get("/health")
def health():
    return {"status": "ok", "service": "bandeja-processor"}


@app.post("/process", response_model=ProcessResponse)
async def process_video(req: ProcessRequest, background_tasks: BackgroundTasks):
    """Kick off background point detection for a match video."""
    background_tasks.add_task(run_detection_pipeline, req)
    return ProcessResponse(
        match_id=req.match_id,
        status="queued",
        message="Detection pipeline started",
    )


async def run_detection_pipeline(req: ProcessRequest):
    """Full 4-stage detection pipeline."""
    from src.detection.scene_change import detect_scene_changes
    from src.detection.motion import analyze_motion
    from src.detection.audio import analyze_audio
    from src.detection.vision import analyze_with_vision
    from src.detection.assembler import assemble_points

    db = get_firestore()
    match_ref = db.collection("matches").document(req.match_id) if db else None

    def update_status(status: str, progress: int):
        print(f"[{req.match_id}] {status} ({progress}%)")
        if match_ref:
            match_ref.update({
                "status": status,
                "processingProgress": progress,
                "updatedAt": __import__("google.cloud.firestore", fromlist=["SERVER_TIMESTAMP"]).SERVER_TIMESTAMP,
            })

    try:
        update_status("processing", 5)

        # Stage 1: Scene change detection
        print(f"[{req.match_id}] Stage 1: Scene change detection")
        segments = detect_scene_changes(req.video_path)
        update_status("processing", 25)

        # Stage 2: Motion analysis
        print(f"[{req.match_id}] Stage 2: Motion analysis ({len(segments)} segments)")
        segments = analyze_motion(req.video_path, segments)
        update_status("processing", 50)

        # Stage 3: Audio analysis
        print(f"[{req.match_id}] Stage 3: Audio analysis")
        segments = analyze_audio(req.video_path, segments)
        update_status("processing", 70)

        # Stage 4: Claude Vision for low-confidence segments
        print(f"[{req.match_id}] Stage 4: Claude Vision")
        segments = analyze_with_vision(req.video_path, segments, threshold=req.confidence_threshold)
        update_status("processing", 85)

        # Assemble final points
        points = assemble_points(req.match_id, segments)
        print(f"[{req.match_id}] Detected {len(points)} points")

        # Write points to Firestore
        if db and points:
            batch = db.batch()
            for point in points:
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
                })
            batch.commit()

            match_ref.update({
                "status": "detected",
                "processingProgress": 100,
                "pointsDetected": len(points),
            })

        update_status("detected", 100)
        print(f"[{req.match_id}] Pipeline complete — {len(points)} points written to Firestore")

    except Exception as e:
        print(f"[{req.match_id}] Pipeline FAILED: {e}")
        if match_ref:
            match_ref.update({"status": "error", "errorMessage": str(e)})
