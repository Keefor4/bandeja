from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="Bandeja Video Processor", version="0.1.0")


class ProcessRequest(BaseModel):
    match_id: str
    video_path: str
    confidence_threshold: float = 0.7


class ProcessResponse(BaseModel):
    match_id: str
    status: str
    message: str


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
    """Full detection pipeline: scene change → motion → audio → Claude Vision."""
    from src.detection.scene_change import detect_scene_changes
    from src.detection.motion import analyze_motion
    from src.detection.assembler import assemble_points

    print(f"[{req.match_id}] Starting detection pipeline: {req.video_path}")

    scene_segments = detect_scene_changes(req.video_path)
    motion_segments = analyze_motion(req.video_path, scene_segments)
    points = assemble_points(req.match_id, motion_segments, req.confidence_threshold)

    print(f"[{req.match_id}] Detected {len(points)} points")
    # TODO: write points to Firestore and update match status
