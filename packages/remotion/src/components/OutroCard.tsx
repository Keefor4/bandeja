import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { TeamNames } from '../types';

export const OutroCard: React.FC<{
  title: string;
  teams: TeamNames | null;
  totalPoints: number;
  finalSetScore?: string;
}> = ({ title, teams, totalPoints, finalSetScore }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const FADE = 18;

  const opacity = interpolate(
    frame,
    [0, FADE, durationInFrames - FADE, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

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
      {/* Subtle court lines */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}
        viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <rect x="240" y="120" width="1440" height="840" fill="none" stroke="#00E5FF" strokeWidth="2"/>
        <line x1="960" y1="120" x2="960" y2="960" stroke="#00E5FF" strokeWidth="1.5"/>
        <line x1="240" y1="540" x2="1680" y2="540" stroke="#00E5FF" strokeWidth="1.5"/>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        <span style={{
          color: '#5C6A7A',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.2em',
          textTransform: 'uppercase' as const,
          marginBottom: 20,
        }}>
          Match Complete
        </span>

        <h2 style={{
          color: '#FFFFFF',
          fontSize: 52,
          fontWeight: 800,
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
          maxWidth: 1200,
          lineHeight: 1.15,
        }}>
          {title}
        </h2>

        {finalSetScore && (
          <div style={{
            marginTop: 20,
            background: 'rgba(0,229,255,0.06)',
            border: '1px solid rgba(0,229,255,0.15)',
            borderRadius: 10,
            padding: '10px 28px',
          }}>
            <span style={{ color: '#00E5FF', fontSize: 28, fontWeight: 800, letterSpacing: '0.06em' }}>
              {finalSetScore}
            </span>
          </div>
        )}

        <div style={{
          width: 200,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 50%, transparent)',
          margin: '36px 0',
        }} />

        {/* Teams */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginBottom: 32 }}>
          <span style={{ color: '#00E5FF', fontSize: 22, fontWeight: 700 }}>{t1}</span>
          <span style={{ color: '#2C3540', fontSize: 16 }}>vs</span>
          <span style={{ color: '#FFB300', fontSize: 22, fontWeight: 700 }}>{t2}</span>
        </div>

        {/* Stats pill */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8,
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ color: '#4A5568', fontSize: 14 }}>
            {totalPoints} points
          </span>
          <span style={{ color: '#2C3540' }}>·</span>
          <span style={{ color: '#4A5568', fontSize: 14 }}>Created with Bandeja</span>
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'linear-gradient(90deg, transparent, #00E5FF 20%, #00E5FF 80%, transparent)',
        opacity: 0.5,
      }} />
    </AbsoluteFill>
  );
};
