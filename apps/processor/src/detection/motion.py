"""Stage 2: Motion analysis using optical flow to distinguish active rally from dead time."""
import cv2
import numpy as np
from .scene_change import Segment


def analyze_motion(video_path: str, segments: list[Segment]) -> list[Segment]:
    """
    For each candidate segment, compute average optical flow magnitude.
    High motion = active rally. Low motion = dead time.
    Returns segments with updated scores.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    results: list[Segment] = []

    for seg in segments:
        start_frame = int(seg.start_time * fps)
        end_frame = int(seg.end_time * fps)
        sample_count = min(30, end_frame - start_frame)

        if sample_count < 2:
            results.append(Segment(seg.start_time, seg.end_time, 0.0))
            continue

        step = max(1, (end_frame - start_frame) // sample_count)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        prev_gray = None
        diff_magnitudes: list[float] = []

        for _ in range(sample_count):
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, (160, 90))  # small for speed

            if prev_gray is not None:
                diff = cv2.absdiff(prev_gray, gray)
                diff_magnitudes.append(float(np.mean(diff)))

            prev_gray = gray
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(cap.get(cv2.CAP_PROP_POS_FRAMES)) + step - 1)

        avg_motion = float(np.mean(diff_magnitudes)) if diff_magnitudes else 0.0
        # Normalize: 0-5 = dead time, 5-20 = moderate, 20+ = active
        motion_score = min(1.0, avg_motion / 20.0)
        combined_score = (seg.score + motion_score) / 2.0
        results.append(Segment(seg.start_time, seg.end_time, combined_score))

    cap.release()
    return results
