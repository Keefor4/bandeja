import { AbsoluteFill, Audio, interpolate, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { ScoreBug } from './ScoreBug';
import type { PointData, TeamNames } from '../types';
import { FADE_FRAMES } from '../utils';

export const PointClip: React.FC<{
  point: PointData;
  teams: TeamNames | null;
  includeAudio: boolean;
}> = ({ point, teams, includeAudio }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity, background: '#000' }}>
      <OffthreadVideo
        src={point.videoSrc}
        startFrom={Math.floor(point.startTime * fps)}
        muted={!includeAudio}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {teams && (point.gameScore || point.setScore) && (
        <ScoreBug point={point} teams={teams} />
      )}
    </AbsoluteFill>
  );
};
