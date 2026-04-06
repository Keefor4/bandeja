import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { TeamNames } from '../types';

export const SetBreakCard: React.FC<{
  setNumber: number;
  setScore: string;
  teams: TeamNames | null;
}> = ({ setNumber, setScore, teams }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const FADE = 15;

  const opacity = interpolate(
    frame,
    [0, FADE, durationInFrames - FADE, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const scale = interpolate(frame, [0, FADE], [0.96, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const [s1 = '0', s2 = '0'] = setScore.split('-');
  const t1 = teams ? `${teams.team1.player1} / ${teams.team1.player2}` : 'Team 1';
  const t2 = teams ? `${teams.team2.player1} / ${teams.team2.player2}` : 'Team 2';

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
      {/* Dark panel */}
      <div style={{
        transform: `scale(${scale})`,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        padding: '64px 120px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        minWidth: 640,
      }}>
        {/* Set label */}
        <span style={{
          color: '#00E5FF',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase' as const,
          opacity: 0.8,
          marginBottom: 16,
        }}>
          Set {setNumber} Complete
        </span>

        {/* Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginBottom: 36 }}>
          <span style={{ color: '#00E5FF', fontSize: 96, fontWeight: 900, lineHeight: 1 }}>{s1}</span>
          <span style={{ color: '#2C3540', fontSize: 56, fontWeight: 300 }}>–</span>
          <span style={{ color: '#FFB300', fontSize: 96, fontWeight: 900, lineHeight: 1 }}>{s2}</span>
        </div>

        {/* Divider */}
        <div style={{
          width: 280,
          height: 1,
          background: 'rgba(255,255,255,0.08)',
          marginBottom: 28,
        }} />

        {/* Team names */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <span style={{ color: '#00E5FF', fontSize: 20, fontWeight: 600, opacity: 0.9 }}>{t1}</span>
          <span style={{ color: '#2C3540', fontSize: 16 }}>vs</span>
          <span style={{ color: '#FFB300', fontSize: 20, fontWeight: 600, opacity: 0.9 }}>{t2}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
