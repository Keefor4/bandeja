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


def _find_player_crops(frame):
    """
    Detect 4 players on an overhead padel court.

    Approach:
    1. Find the court playing surface (largest blue blob) to get court bounds.
    2. Divide the court into 4 quadrants (net splits top/bottom, midpoint splits left/right).
    3. In each quadrant find the largest non-blue blob — that's the player.
    4. Return a close-up crop centered on each player (fallback: quadrant center).

    This works regardless of player clothing color and ignores fences/walls/stands
    because the search is restricted to within the court boundary.
    """
    import cv2
    import numpy as np

    orig_h, orig_w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # ── Step 1: Locate the court ─────────────────────────────────────────────
    # Blue court surface mask (wide range to handle different lighting)
    court_color = cv2.inRange(hsv, np.array([85, 35, 25]), np.array([150, 255, 255]))
    k_close = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
    court_closed = cv2.morphologyEx(court_color, cv2.MORPH_CLOSE, k_close, iterations=3)

    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(court_closed)
    if n_labels < 2:
        return []

    # Largest blob = the court playing surface
    court_idx = max(range(1, n_labels), key=lambda i: stats[i, cv2.CC_STAT_AREA])
    court_x  = stats[court_idx, cv2.CC_STAT_LEFT]
    court_y  = stats[court_idx, cv2.CC_STAT_TOP]
    court_w  = stats[court_idx, cv2.CC_STAT_WIDTH]
    court_h  = stats[court_idx, cv2.CC_STAT_HEIGHT]

    # Inset 4% to stay away from boundary noise
    inset_x = int(court_w * 0.04)
    inset_y = int(court_h * 0.04)
    x_min = court_x + inset_x
    y_min = court_y + inset_y
    x_max = court_x + court_w - inset_x
    y_max = court_y + court_h - inset_y

    # ── Step 2: Build player mask restricted to inside the court ─────────────
    white_mask = cv2.inRange(hsv, np.array([0, 0, 180]), np.array([180, 45, 255]))
    non_court  = cv2.bitwise_not(cv2.bitwise_or(court_color, white_mask))

    # Keep only pixels inside the court bounding box
    court_roi = np.zeros_like(non_court)
    court_roi[y_min:y_max, x_min:x_max] = non_court[y_min:y_max, x_min:x_max]

    k_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    k_close2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    court_roi = cv2.morphologyEx(court_roi, cv2.MORPH_OPEN,  k_open)
    court_roi = cv2.morphologyEx(court_roi, cv2.MORPH_CLOSE, k_close2, iterations=2)

    # ── Step 3: 4 quadrants — net at vertical midpoint, midline at horizontal midpoint
    net_y  = (y_min + y_max) // 2
    mid_x  = (x_min + x_max) // 2

    quadrants = [
        (y_min, net_y,  x_min, mid_x),   # Team 1 · Left
        (y_min, net_y,  mid_x, x_max),   # Team 1 · Right
        (net_y, y_max,  x_min, mid_x),   # Team 2 · Left
        (net_y, y_max,  mid_x, x_max),   # Team 2 · Right
    ]

    crops = []
    for (qy1, qy2, qx1, qx2) in quadrants:
        # Largest blob in this quadrant = player
        quad_mask = np.zeros_like(court_roi)
        quad_mask[qy1:qy2, qx1:qx2] = court_roi[qy1:qy2, qx1:qx2]

        nq, _, qstats, qcent = cv2.connectedComponentsWithStats(quad_mask)

        if nq >= 2:
            best = max(range(1, nq), key=lambda i: qstats[i, cv2.CC_STAT_AREA])
            pcx = int(qcent[best][0])
            pcy = int(qcent[best][1])
        else:
            # Fallback: center of the quadrant
            pcx = (qx1 + qx2) // 2
            pcy = (qy1 + qy2) // 2

        # ── Step 4: Crop centered on the player ──────────────────────────────
        # Half-size = half the quadrant dimensions → player fills ~50% of crop
        half_w = (qx2 - qx1) // 2
        half_h = (qy2 - qy1) // 2
        cx1 = max(0,      pcx - half_w)
        cy1 = max(0,      pcy - half_h)
        cx2 = min(orig_w, pcx + half_w)
        cy2 = min(orig_h, pcy + half_h)

        crop = frame[cy1:cy2, cx1:cx2]
        if crop.size > 0:
            crop_resized = cv2.resize(crop, (220, 280))
            crops.append(crop_resized)

    return crops


@app.post("/extract-players")
async def extract_players(req: ExtractPlayersRequest):
    """
    Return 4 close-up overhead crops — one per player — from the best frame
    found starting at 10 minutes into the video.

    Response:
      frames       - best full-court frame (base64 JPEG, for reference)
      player_crops - 4 individual player crops sorted left-to-right (base64 JPEG)
      players_found - number of player blobs detected
    """
    import cv2
    import base64

    cap = cv2.VideoCapture(req.video_path)
    if not cap.isOpened():
        return {"error": "Could not open video", "frames": [], "player_crops": []}

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    total_duration = total_frames / fps if total_frames > 0 else 3600.0

    # Start at 10 min in (or 10 % of video, minimum 60 s)
    start_time = max(60.0, min(600.0, total_duration * 0.10))
    end_time   = min(total_duration * 0.80, start_time + 300.0)
    if end_time <= start_time:
        end_time = max(start_time + 10.0, total_duration - 10.0)

    num_candidates = 20
    step = (end_time - start_time) / max(num_candidates - 1, 1)
    candidate_times = [start_time + step * i for i in range(num_candidates)]

    best_frame = None
    best_crops: list = []

    for t in candidate_times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ret, frame = cap.read()
        if not ret:
            continue

        crops = _find_player_crops(frame)
        if len(crops) > len(best_crops):
            best_crops = crops
            best_frame = frame.copy()
            if len(best_crops) >= 4:
                break  # found all 4 — stop scanning

    cap.release()

    if best_frame is None:
        return {"error": "Could not read frames", "frames": [], "player_crops": []}

    # Full reference frame
    frame_display = cv2.resize(best_frame, (1280, 720))
    _, buf = cv2.imencode('.jpg', frame_display, [cv2.IMWRITE_JPEG_QUALITY, 85])
    full_b64 = base64.b64encode(buf.tobytes()).decode('utf-8')

    # Encode individual player crops
    player_crops_b64 = []
    for crop in best_crops:
        _, cbuf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        player_crops_b64.append(base64.b64encode(cbuf.tobytes()).decode('utf-8'))

    return {
        "frames": [full_b64],
        "player_crops": player_crops_b64,
        "players_found": len(best_crops),
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
