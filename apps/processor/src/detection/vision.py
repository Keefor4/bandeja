"""
Stage 4: Claude Vision analysis for segments below confidence threshold.
Samples 5 frames and asks Claude whether a padel point is being played.
"""
import base64
import os
import cv2
import numpy as np
from .scene_change import Segment

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False


VISION_PROMPT = """You are analyzing frames from a padel match video to determine if an active point is being played.

I will show you {n} frames sampled from a video segment ({duration:.1f} seconds long).

For each set of frames, answer these questions:
1. Is a padel point actively being played? (players in rally position, ball in play)
2. Are players in serve position, rally position, or idle/walking?
3. Is the court visible and are players positioned actively?

Based on your analysis, respond with ONLY a JSON object in this exact format:
{{
  "is_active_point": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation"
}}

Consider it an active point if players are:
- In a rally (hitting ball back and forth)
- Serving or receiving serve
- Moving dynamically to reach the ball

Consider it NOT an active point if:
- Players are walking, retrieving balls, resting
- Players are celebrating or disputing a point
- The court is empty or players are at the net chatting
- There is a clear break in play"""


def extract_frames_for_vision(video_path: str, start_time: float, end_time: float, n_frames: int = 5) -> list[str]:
    """Extract n evenly-spaced frames as base64-encoded JPEG strings."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = end_time - start_time
    timestamps = [start_time + (duration * i / (n_frames - 1)) for i in range(n_frames)]

    frames_b64: list[str] = []
    for ts in timestamps:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(ts * fps))
        ret, frame = cap.read()
        if not ret:
            continue
        # Resize to reduce API payload (720p → 480p width)
        frame = cv2.resize(frame, (854, 480))
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        frames_b64.append(base64.b64encode(buf.tobytes()).decode('utf-8'))

    cap.release()
    return frames_b64


def analyze_with_vision(video_path: str, segments: list[Segment], threshold: float = 0.7) -> list[Segment]:
    """
    For segments below threshold, use Claude Vision to verify if active play is happening.
    Segments above threshold are passed through unchanged.
    """
    if not ANTHROPIC_AVAILABLE:
        print("WARNING: anthropic not installed — skipping vision analysis")
        return segments

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("WARNING: ANTHROPIC_API_KEY not set — skipping vision analysis")
        return segments

    client = anthropic.Anthropic(api_key=api_key)
    results: list[Segment] = []
    low_confidence = [s for s in segments if s.score < threshold]
    print(f"[Vision] Analyzing {len(low_confidence)} low-confidence segments with Claude Vision")

    for seg in segments:
        if seg.score >= threshold:
            results.append(seg)
            continue

        duration = seg.end_time - seg.start_time
        frames = extract_frames_for_vision(video_path, seg.start_time, seg.end_time, n_frames=5)

        if not frames:
            results.append(seg)
            continue

        try:
            content: list = []
            for i, frame_b64 in enumerate(frames):
                content.append({
                    "type": "text",
                    "text": f"Frame {i + 1} of {len(frames)} (at {seg.start_time + (duration * i / max(len(frames) - 1, 1)):.1f}s):"
                })
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": frame_b64,
                    },
                })

            content.append({
                "type": "text",
                "text": VISION_PROMPT.format(n=len(frames), duration=duration),
            })

            response = client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=256,
                messages=[{"role": "user", "content": content}],
            )

            import json
            text = response.content[0].text.strip()
            # Extract JSON from response (handle markdown code blocks)
            if "```" in text:
                text = text.split("```")[1].lstrip("json").strip()

            parsed = json.loads(text)
            vision_confidence = float(parsed.get("confidence", 0.5))
            is_active = bool(parsed.get("is_active_point", False))

            if not is_active:
                vision_confidence = vision_confidence * 0.3  # penalize non-active

            # Blend: existing score 50%, vision 50%
            blended = (seg.score * 0.5) + (vision_confidence * 0.5)
            results.append(Segment(seg.start_time, seg.end_time, min(1.0, blended)))
            print(f"[Vision] {seg.start_time:.1f}s-{seg.end_time:.1f}s: active={is_active}, confidence={vision_confidence:.2f} → blended={blended:.2f}")

        except Exception as e:
            print(f"[Vision] Error analyzing segment {seg.start_time:.1f}s: {e}")
            results.append(seg)

    return results
