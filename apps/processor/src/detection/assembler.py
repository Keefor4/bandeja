"""Assembles scored segments into DetectedPoint objects, applying learned signal weights."""
import uuid
from dataclasses import dataclass, field
from .scene_change import Segment

DEFAULT_WEIGHTS = {
    "sceneChange":    0.20,
    "motionAnalysis": 0.25,
    "audioAnalysis":  0.35,
    "visionAnalysis": 0.20,
}


@dataclass
class DetectedPointData:
    id: str
    match_id: str
    point_number: int
    start_time: float
    end_time: float
    duration: float
    confidence: float
    detection_signals: dict = field(default_factory=dict)
    status: str = "pending"


def assemble_points(
    match_id: str,
    segments: list[Segment],
    weights: dict | None = None,
    min_duration: float = 3.0,
    max_duration: float = 120.0,
) -> list[DetectedPointData]:
    """
    Filter and score segments using learned signal weights.
    Each segment carries per-signal scores; we apply weights to get final confidence.
    """
    w = weights or DEFAULT_WEIGHTS
    # Normalize weights in case they don't sum to 1
    total_w = sum(w.values()) or 1.0
    norm_w = {k: v / total_w for k, v in w.items()}

    points: list[DetectedPointData] = []
    point_number = 1

    for seg in segments:
        duration = seg.end_time - seg.start_time
        if duration < min_duration or duration > max_duration:
            continue

        # seg.signals holds per-stage scores (populated by each detection stage)
        # Fall back to seg.score if individual signals aren't available yet
        signals = getattr(seg, 'signals', None) or {
            "sceneChange":    seg.score,
            "motionAnalysis": seg.score,
            "audioAnalysis":  seg.score,
            "visionAnalysis": seg.score,
        }

        # Weighted confidence
        confidence = sum(
            signals.get(k, seg.score) * norm_w.get(k, 0.25)
            for k in ["sceneChange", "motionAnalysis", "audioAnalysis", "visionAnalysis"]
        )
        confidence = min(1.0, max(0.0, confidence))

        if confidence < 0.25:
            continue  # Too low even for review

        points.append(DetectedPointData(
            id=str(uuid.uuid4()),
            match_id=match_id,
            point_number=point_number,
            start_time=seg.start_time,
            end_time=seg.end_time,
            duration=duration,
            confidence=round(confidence, 4),
            detection_signals={
                "sceneChange":    round(signals.get("sceneChange", seg.score), 4),
                "motionAnalysis": round(signals.get("motionAnalysis", seg.score), 4),
                "audioAnalysis":  round(signals.get("audioAnalysis", seg.score), 4),
                "visionAnalysis": round(signals.get("visionAnalysis", seg.score), 4),
            },
        ))
        point_number += 1

    return points
