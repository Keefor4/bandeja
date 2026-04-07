"""Stage 1: Scene change detection using FFmpeg keyframe extraction."""
import subprocess
import re
import json
from dataclasses import dataclass


@dataclass
class Segment:
    start_time: float  # seconds
    end_time: float
    score: float       # 0-1 confidence this is an active segment


def detect_scene_changes(video_path: str, threshold: float = 0.3) -> list[Segment]:
    """
    Detect scene changes using FFmpeg to extract keyframe timestamps.
    Keyframes only — extremely fast regardless of video length.
    """
    print(f"  Extracting keyframe timestamps via FFmpeg...")

    # Get total duration
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", video_path],
        capture_output=True, text=True, timeout=30,
    )
    total_duration = 3600.0
    try:
        info = json.loads(probe.stdout)
        total_duration = float(info.get("format", {}).get("duration", 3600))
    except Exception:
        pass
    print(f"  Duration: {total_duration:.0f}s")

    # Extract keyframe timestamps only (fast — no decoding)
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-select_streams", "v",
            "-skip_frame", "nokey",
            "-show_entries", "frame=pkt_pts_time",
            "-print_format", "csv=p=0",
            video_path,
        ],
        capture_output=True, text=True, timeout=120,
    )

    change_times: list[float] = [0.0]
    prev_t = 0.0
    min_gap = 3.0  # ignore keyframes less than 3s apart

    for line in result.stdout.strip().splitlines():
        line = line.strip()
        if not line or line == 'N/A':
            continue
        try:
            t = float(line)
            if t - prev_t >= min_gap:
                change_times.append(t)
                prev_t = t
        except ValueError:
            continue

    change_times.append(total_duration)
    print(f"  Found {len(change_times) - 2} keyframe boundaries")

    segments = []
    for i in range(len(change_times) - 1):
        start = change_times[i]
        end = change_times[i + 1]
        duration = end - start
        score = min(1.0, duration / 30.0)
        segments.append(Segment(start_time=start, end_time=end, score=score))

    return segments
