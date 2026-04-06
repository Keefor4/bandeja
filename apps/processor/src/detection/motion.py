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
        flow_magnitudes: list[float] = []

        for _ in range(sample_count):
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, (320, 180))  # downsample for speed

            if prev_gray is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_gray, gray, None,
                    pyr_scale=0.5, levels=3, winsize=15,
                    iterations=3, poly_n=5, poly_sigma=1.2, flags=0
                )
                magnitude = float(np.mean(np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)))
                flow_magnitudes.append(magnitude)

            prev_gray = gray
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(cap.get(cv2.CAP_PROP_POS_FRAMES)) + step - 1)

        avg_motion = float(np.mean(flow_magnitudes)) if flow_magnitudes else 0.0
        # Normalize: 0-2 motion = dead time, 2-8 = moderate, 8+ = active
        motion_score = min(1.0, avg_motion / 8.0)
        combined_score = (seg.score + motion_score) / 2.0
        results.append(Segment(seg.start_time, seg.end_time, combined_score))

    cap.release()
    return results
