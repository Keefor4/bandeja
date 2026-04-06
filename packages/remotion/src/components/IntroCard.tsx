import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { TeamNames } from '../types';

export const IntroCard: React.FC<{
  title: string;
  date: string;
  teams: TeamNames | null;
}> = ({ title, date, teams }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const FADE = 18;

  const opacity = interpolate(
    frame,
    [0, FADE, durationInFrames - FADE, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const slideY = interpolate(frame, [0, FADE], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const t1 = teams ? `${teams.team1.player1} / ${teams.team1.player2}` : 'Team 1';
  const t2 = teams ? `${teams.team2.player1} / ${teams.team2.player2}` : 'Team 2';

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(160deg, #060A0F 0%, #0C1420 50%, #060A0F 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    }}>
      {/* Subtle court lines background */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}
        viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <rect x="240" y="120" width="1440" height="840" fill="none" stroke="#00E5FF" strokeWidth="2"/>
        <line x1="960" y1="120" x2="960" y2="960" stroke="#00E5FF" strokeWidth="1.5"/>
        <line x1="240" y1="540" x2="1680" y2="540" stroke="#00E5FF" strokeWidth="1.5"/>
        <rect x="520" y="280" width="880" height="520" fill="none" stroke="#00E5FF" strokeWidth="1"/>
      </svg>

      <div style={{ transform: `translateY(${slideY}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {/* Label */}
        <span style={{
          color: '#00E5FF',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase' as const,
          marginBottom: 20,
          opacity: 0.85,
        }}>
          Bandeja Highlights
        </span>

        {/* Title */}
        <h1 style={{
          color: '#FFFFFF',
          fontSize: 72,
          fontWeight: 800,
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          maxWidth: 1400,
        }}>
          {title}
        </h1>

        {/* Date */}
        <span style={{
          color: '#5C6A7A',
          fontSize: 22,
          fontWeight: 400,
          marginTop: 16,
          marginBottom: 60,
        }}>
          {date}
        </span>

        {/* Cyan divider */}
        <div style={{
          width: 320,
          height: 1,
          background: 'linear-gradient(90deg, transparent, #00E5FF 30%, #00E5FF 70%, transparent)',
          marginBottom: 48,
          opacity: 0.5,
        }} />

        {/* Teams */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ color: '#00E5FF', fontSize: 28, fontWeight: 700 }}>{t1}</div>
          </div>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ color: '#4A5568', fontSize: 14, fontWeight: 600, letterSpacing: '0.05em' }}>VS</span>
          </div>
          <div style={{ textAlign: 'left' as const }}>
            <div style={{ color: '#FFB300', fontSize: 28, fontWeight: 700 }}>{t2}</div>
          </div>
        </div>
      </div>

      {/* Bottom cyan bar */}
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
