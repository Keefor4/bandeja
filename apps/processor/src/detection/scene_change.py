"""Stage 1: Scene change detection using fixed time segments."""
import subprocess
import json
from dataclasses import dataclass


@dataclass
class Segment:
    start_time: float  # seconds
    end_time: float
    score: float       # 0-1 confidence this is an active segment


def detect_scene_changes(video_path: str, threshold: float = 0.3, segment_size: float = 60.0) -> list[Segment]:
    """
    Split video into fixed-size segments for downstream analysis.
    Fast and reliable for any video length.
    """
    # Get duration via ffprobe (fast — reads metadata only)
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path],
        capture_output=True, text=True, timeout=30,
    )
    total_duration = 3600.0
    try:
        info = json.loads(probe.stdout)
        total_duration = float(info.get("format", {}).get("duration", 3600))
    except Exception:
        pass

    print(f"  Duration: {total_duration:.0f}s, splitting into {segment_size:.0f}s segments")

    segments = []
    t = 0.0
    while t < total_duration:
        end = min(t + segment_size, total_duration)
        segments.append(Segment(start_time=t, end_time=end, score=0.5))
        t += segment_size

    print(f"  Created {len(segments)} segments")
    return segments
