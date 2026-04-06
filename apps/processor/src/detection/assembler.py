"""Assembles scored segments into DetectedPoint objects."""
import uuid
from dataclasses import dataclass
from .scene_change import Segment


@dataclass
class DetectedPointData:
    id: str
    match_id: str
    point_number: int
    start_time: float
    end_time: float
    duration: float
    confidence: float
    detection_signals: dict
    status: str = "pending"


def assemble_points(
    match_id: str,
    segments: list[Segment],
    confidence_threshold: float = 0.7,
    min_duration: float = 3.0,
    max_duration: float = 120.0,
) -> list[DetectedPointData]:
    """
    Filter segments by confidence and duration to produce detected points.
    Segments below threshold are flagged for Claude Vision review (handled separately).
    """
    points: list[DetectedPointData] = []
    point_number = 1

    for seg in segments:
        duration = seg.end_time - seg.start_time
        if duration < min_duration or duration > max_duration:
            continue
        if seg.score < 0.3:
            continue  # Too low confidence even for Vision review

        points.append(DetectedPointData(
            id=str(uuid.uuid4()),
            match_id=match_id,
            point_number=point_number,
            start_time=seg.start_time,
            end_time=seg.end_time,
            duration=duration,
            confidence=seg.score,
            detection_signals={
                "sceneChange": seg.score,  # placeholder until signals are separated
                "motionAnalysis": seg.score,
            },
            status="pending",
        ))
        point_number += 1

    return points
