"""Stage 1: Scene change detection using FFmpeg scene filter."""
import subprocess
import re
from dataclasses import dataclass


@dataclass
class Segment:
    start_time: float  # seconds
    end_time: float
    score: float       # 0-1 confidence this is an active segment


def detect_scene_changes(video_path: str, threshold: float = 0.3) -> list[Segment]:
    """
    Detect scene changes using FFmpeg's built-in scene detection filter.
    Much faster than OpenCV frame-by-frame — FFmpeg processes at full speed.
    threshold: 0.0-1.0, higher = fewer scene changes detected (default 0.3)
    """
    print(f"  Running FFmpeg scene detection (threshold={threshold})...")

    result = subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vf", f"select='gt(scene,{threshold})',showinfo",
            "-vsync", "vfr",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
        timeout=600,
    )

    # FFmpeg outputs showinfo to stderr
    output = result.stderr

    # Parse timestamps from showinfo output: "pts_time:12.345"
    change_times: list[float] = [0.0]
    for match in re.finditer(r'pts_time:([\d.]+)', output):
        t = float(match.group(1))
        change_times.append(t)

    # Get total duration
    duration_match = re.search(r'Duration:\s*(\d+):(\d+):([\d.]+)', output)
    if duration_match:
        h, m, s = duration_match.groups()
        total_duration = int(h) * 3600 + int(m) * 60 + float(s)
    else:
        total_duration = change_times[-1] + 30 if len(change_times) > 1 else 3600

    change_times.append(total_duration)
    print(f"  Found {len(change_times) - 2} scene changes, total duration: {total_duration:.0f}s")

    segments = []
    for i in range(len(change_times) - 1):
        start = change_times[i]
        end = change_times[i + 1]
        duration = end - start
        score = min(1.0, duration / 30.0)
        segments.append(Segment(start_time=start, end_time=end, score=score))

    return segments
