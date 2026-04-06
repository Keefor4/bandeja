"""
Winner detection: analyzes the last 3 seconds of an approved point
to determine which team won, using Claude Vision.
"""
import base64
import json
import os
import cv2

WINNER_PROMPT = """You are analyzing the final moments of a padel point to determine which team won.

I'm showing you {n} frames from the LAST {duration:.1f} seconds of the point.

In padel doubles:
- Team 1 plays on one side of the court (typically the left/near side in the camera view)
- Team 2 plays on the other side (typically the right/far side)

Look for these signals to determine the winner:
1. **Ball going out** — which side's court did the ball land out of bounds?
2. **Player reactions** — who is celebrating vs frustrated/disappointed?
3. **Ball position** — where did the last shot land (in or out)?
4. **Net fault** — did the ball hit the net on which side's shot?
5. **Glass wall** — did the ball bounce off the glass and couldn't be returned by which team?

Important: If the full court is not visible, or you cannot clearly see who won, say so.

Respond ONLY with this JSON (no markdown):
{{
  "winner": "team1" or "team2" or null,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation of what you observed",
  "full_court_visible": true or false,
  "needs_review": true or false
}}

Set needs_review=true if:
- The full court is not visible
- Confidence is below 0.65
- You cannot clearly determine who won
- The ending is ambiguous"""


def extract_last_frames(video_path: str, end_time: float, n_frames: int = 3, lookback: float = 3.0) -> list[str]:
    """Extract n frames from the last `lookback` seconds of a point as base64 JPEG."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    start_time = max(0.0, end_time - lookback)
    start_frame = int(start_time * fps)
    end_frame = int(end_time * fps)
    total = max(1, end_frame - start_frame)
    step = max(1, total // n_frames)

    frames_b64: list[str] = []
    for i in range(n_frames):
        frame_idx = start_frame + (i * step)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue
        frame = cv2.resize(frame, (854, 480))
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        frames_b64.append(base64.b64encode(buf.tobytes()).decode('utf-8'))

    cap.release()
    return frames_b64


def detect_winner(video_path: str, end_time: float) -> dict:
    """
    Use Claude Vision to determine which team won the point.
    Returns dict with winner, confidence, reason, needs_review.
    """
    default = {"winner": None, "confidence": 0.0, "reason": "Detection skipped", "needs_review": True}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return default

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        lookback = 3.0
        frames = extract_last_frames(video_path, end_time, n_frames=3, lookback=lookback)
        if not frames:
            return {**default, "reason": "Could not extract frames"}

        content: list = []
        for i, frame_b64 in enumerate(frames):
            content.append({"type": "text", "text": f"Frame {i+1} of {len(frames)} (from last {lookback}s of point):"})
            content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": frame_b64}})

        content.append({"type": "text", "text": WINNER_PROMPT.format(n=len(frames), duration=lookback)})

        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=300,
            messages=[{"role": "user", "content": content}],
        )

        text = response.content[0].text.strip()
        if "```" in text:
            text = text.split("```")[1].lstrip("json").strip()

        result = json.loads(text)
        confidence = float(result.get("confidence", 0.0))
        needs_review = bool(result.get("needs_review", True)) or confidence < 0.65

        return {
            "winner": result.get("winner"),
            "confidence": round(confidence, 3),
            "reason": result.get("reason", ""),
            "needs_review": needs_review,
            "full_court_visible": result.get("full_court_visible", False),
        }

    except Exception as e:
        print(f"[Winner detection] Error: {e}")
        return {**default, "reason": f"Error: {str(e)}"}
