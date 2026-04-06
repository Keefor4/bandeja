import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import { IntroCard } from '../components/IntroCard';
import { OutroCard } from '../components/OutroCard';
import { PointClip } from '../components/PointClip';
import { SetBreakCard } from '../components/SetBreakCard';
import { buildSegments } from '../utils';
import type { HighlightReelProps, PointData } from '../types';

export const HighlightReel: React.FC<HighlightReelProps> = ({
  matchTitle,
  matchDate,
  teams,
  points,
  includeMusic,
  musicSrc,
}) => {
  const { fps } = useVideoConfig();
  const segments = buildSegments(points, fps);

  // Derive the final set score for the outro card
  const lastPoint = points[points.length - 1];
  const finalSetScore = lastPoint?.matchScore ?? undefined;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Optional background music */}
      {includeMusic && musicSrc && (
        <Audio src={musicSrc} volume={0.25} />
      )}

      {segments.map((seg, i) => (
        <Sequence key={i} from={seg.from} durationInFrames={seg.duration}>
          {seg.type === 'intro' && (
            <IntroCard title={matchTitle} date={matchDate} teams={teams} />
          )}
          {seg.type === 'point' && (
            <PointClip
              point={seg.data as PointData}
              teams={teams}
              includeAudio={!includeMusic}
            />
          )}
          {seg.type === 'setbreak' && (() => {
            const d = seg.data as { setScore: string; setNumber: number };
            return (
              <SetBreakCard
                setNumber={d.setNumber}
                setScore={d.setScore}
                teams={teams}
              />
            );
          })()}
          {seg.type === 'outro' && (
            <OutroCard
              title={matchTitle}
              teams={teams}
              totalPoints={points.length}
              finalSetScore={finalSetScore}
            />
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
