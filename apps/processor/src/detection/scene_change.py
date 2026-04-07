"""Stage 1: Scene change detection using OpenCV frame differencing."""
import cv2
import numpy as np
from dataclasses import dataclass


@dataclass
class Segment:
    start_time: float  # seconds
    end_time: float
    score: float       # 0-1 confidence this is an active segment


def detect_scene_changes(video_path: str, threshold: float = 30.0, sample_interval: float = 1.0) -> list[Segment]:
    """
    Detect scene changes by seeking to sample frames every N seconds.
    Much faster than reading every frame — seeks directly to timestamps.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    total_duration = total_frames / fps
    print(f"  Video: {total_duration:.0f}s at {fps:.1f}fps, sampling every {sample_interval}s")

    change_times: list[float] = [0.0]
    prev_frame = None
    t = 0.0

    while t < total_duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ret, frame = cap.read()
        if not ret:
            t += sample_interval
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (320, 180))
        if prev_frame is not None:
            diff = cv2.absdiff(prev_frame, gray)
            mean_diff = float(np.mean(diff))
            if mean_diff > threshold:
                change_times.append(t)
        prev_frame = gray
        t += sample_interval

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
