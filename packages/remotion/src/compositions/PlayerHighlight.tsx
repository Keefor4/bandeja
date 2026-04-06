import { AbsoluteFill, Audio, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { FADE_FRAMES } from '../utils';
import type { PlayerHighlightProps, PointData } from '../types';

const INTRO_FRAMES = 90; // 3 seconds at 30fps
const MAX_CLIP_SECONDS = 27; // 30s total - 3s intro

// Name card shown at start
const PlayerIntroCard: React.FC<{ playerName: string; matchTitle: string; matchDate: string }> = ({
  playerName, matchTitle, matchDate,
}) => {
  const frame = useCurrentFrame();
  const FADE = 15;
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, FADE, durationInFrames - FADE, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{
      background: '#060A0F',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    }}>
      <span style={{
        color: '#00E5FF',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.2em',
        textTransform: 'uppercase' as const,
        marginBottom: 16,
        opacity: 0.8,
      }}>
        Player Highlights
      </span>
      <h1 style={{
        color: '#FFFFFF',
        fontSize: 80,
        fontWeight: 900,
        margin: 0,
        textAlign: 'center',
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        {playerName}
      </h1>
      <p style={{
        color: '#5C6A7A',
        fontSize: 18,
        fontWeight: 400,
        marginTop: 14,
        textAlign: 'center',
      }}>
        {matchTitle} · {matchDate}
      </p>
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'linear-gradient(90deg, transparent, #00E5FF 20%, #00E5FF 80%, transparent)',
        opacity: 0.6,
      }} />
    </AbsoluteFill>
  );
};

// Vertical clip with center crop
const VerticalClip: React.FC<{ point: PointData; includeAudio: boolean }> = ({ point, includeAudio }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity, background: '#000', overflow: 'hidden' }}>
      <OffthreadVideo
        src={point.videoSrc}
        startFrom={Math.floor(point.startTime * fps)}
        muted={!includeAudio}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 35%',
        }}
      />
      {/* Player name watermark */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      }}>
        <div style={{
          background: 'rgba(5,8,12,0.8)',
          border: '1px solid rgba(0,229,255,0.2)',
          borderRadius: 8,
          padding: '6px 16px',
        }}>
          <span style={{ color: '#00E5FF', fontSize: 14, fontWeight: 600 }}>
            {point.shotType ?? (point.howWon ?? '')}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PlayerHighlight: React.FC<PlayerHighlightProps> = ({
  playerName, matchTitle, matchDate, points, includeMusic, musicSrc,
}) => {
  const { fps } = useVideoConfig();

  // Build clip sequence, cap at MAX_CLIP_SECONDS total
  const clips: Array<{ from: number; duration: number; point: PointData }> = [];
  let offset = INTRO_FRAMES;
  let usedSeconds = 0;

  for (const point of points) {
    const clipSeconds = Math.min(point.endTime - point.startTime, MAX_CLIP_SECONDS - usedSeconds);
    if (clipSeconds <= 0) break;
    const dur = Math.round(clipSeconds * fps);
    clips.push({ from: offset, duration: dur, point });
    offset += dur;
    usedSeconds += clipSeconds;
    if (usedSeconds >= MAX_CLIP_SECONDS) break;
  }

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {includeMusic && musicSrc && (
        <Audio src={musicSrc} volume={0.3} />
      )}

      {/* Intro */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <PlayerIntroCard playerName={playerName} matchTitle={matchTitle} matchDate={matchDate} />
      </Sequence>

      {/* Clips */}
      {clips.map((clip, i) => (
        <Sequence key={i} from={clip.from} durationInFrames={clip.duration}>
          <VerticalClip point={clip.point} includeAudio={!includeMusic} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
