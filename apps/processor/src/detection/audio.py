"""
Stage 3: Audio analysis — detects ball hits and crowd/player reactions.
Audio is weighted heavily since ball sounds are clear and reliable.
"""
import subprocess
import tempfile
import os
import numpy as np
from .scene_change import Segment

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("WARNING: librosa not installed — audio analysis disabled")


def extract_audio(video_path: str, output_path: str) -> bool:
    """Extract mono audio track from video using FFmpeg."""
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-ac", "1",          # mono
            "-ar", "22050",      # 22kHz is enough for ball hit detection
            "-vn",               # no video
            output_path,
        ],
        capture_output=True,
        timeout=300,
    )
    return result.returncode == 0


def analyze_audio(video_path: str, segments: list[Segment]) -> list[Segment]:
    """
    Analyze audio to distinguish active play from dead time.

    Signals used:
    - Onset strength (ball hits = sharp onsets)
    - RMS energy (active play = higher sustained energy)
    - Silence ratio (dead time = lots of silence)
    """
    if not LIBROSA_AVAILABLE:
        return segments

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        audio_path = f.name

    try:
        if not extract_audio(video_path, audio_path):
            print("WARNING: FFmpeg audio extraction failed — skipping audio analysis")
            return segments

        # Skip audio analysis if file is too large (>150MB WAV)
        audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        if audio_size_mb > 150:
            print(f"WARNING: Audio file too large ({audio_size_mb:.0f}MB) — skipping audio analysis to avoid OOM")
            return segments

        y, sr = librosa.load(audio_path, sr=22050, mono=True)
        results = []

        for seg in segments:
            start_sample = int(seg.start_time * sr)
            end_sample = int(seg.end_time * sr)

            if end_sample <= start_sample or end_sample > len(y):
                results.append(seg)
                continue

            chunk = y[start_sample:end_sample]

            # --- Ball hit detection via onset strength ---
            onset_env = librosa.onset.onset_strength(y=chunk, sr=sr)
            # Normalize onset strength
            if onset_env.max() > 0:
                onset_env = onset_env / onset_env.max()

            # Count sharp onsets (ball hits have fast attack)
            onset_frames = librosa.onset.onset_detect(
                onset_envelope=onset_env, sr=sr, units='frames',
                pre_max=1, post_max=1, pre_avg=3, post_avg=3, delta=0.07, wait=3
            )
            duration = seg.end_time - seg.start_time
            hits_per_second = len(onset_frames) / max(duration, 1.0)

            # Padel: active rally = 1-4 hits/sec, dead time < 0.3 hits/sec
            hit_score = min(1.0, hits_per_second / 3.0)

            # --- RMS energy (sustained activity) ---
            rms = librosa.feature.rms(y=chunk)[0]
            rms_mean = float(np.mean(rms))
            rms_score = min(1.0, rms_mean * 20.0)  # normalize

            # --- Silence ratio ---
            silence_threshold = 0.01
            silence_ratio = float(np.mean(np.abs(chunk) < silence_threshold))
            activity_score = 1.0 - silence_ratio

            # Weighted audio score — hits are the strongest signal
            audio_score = (hit_score * 0.5) + (rms_score * 0.25) + (activity_score * 0.25)

            # Combine with existing score — audio weighted at 40%
            combined = (seg.score * 0.6) + (audio_score * 0.4)
            results.append(Segment(seg.start_time, seg.end_time, min(1.0, combined)))

        return results

    finally:
        if os.path.exists(audio_path):
            os.unlink(audio_path)
