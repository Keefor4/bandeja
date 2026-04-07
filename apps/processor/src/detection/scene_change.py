"""Stage 1: Scene change detection using OpenCV frame differencing."""
import cv2
import numpy as np
from dataclasses import dataclass


@dataclass
class Segment:
    start_time: float  # seconds
    end_time: float
    score: float       # 0-1 confidence this is an active segment


def detect_scene_changes(video_path: str, threshold: float = 30.0, sample_every_n: int = 15) -> list[Segment]:
    """
    Detect scene changes by analyzing frame-to-frame difference.
    Samples every N frames (default: every 15 frames = ~0.5s at 30fps).
    Returns candidate segments (gaps between major changes = dead time).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    segments: list[Segment] = []
    prev_frame = None
    change_times: list[float] = [0.0]

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_every_n == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, (320, 180))  # downsample for speed
            if prev_frame is not None:
                diff = cv2.absdiff(prev_frame, gray)
                mean_diff = float(np.mean(diff))
                if mean_diff > threshold:
                    timestamp = frame_idx / fps
                    change_times.append(timestamp)
            prev_frame = gray

        frame_idx += 1

    total_duration = frame_idx / fps
    change_times.append(total_duration)
    cap.release()

    # Convert change times to segments
    for i in range(len(change_times) - 1):
        start = change_times[i]
        end = change_times[i + 1]
        duration = end - start
        # Short segments after a scene change are likely active play
        score = min(1.0, duration / 30.0)  # normalize: 30s+ = full confidence
        segments.append(Segment(start_time=start, end_time=end, score=score))

    return segments
