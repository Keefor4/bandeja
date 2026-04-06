import { AbsoluteFill } from 'remotion';
import type { PointData, TeamNames } from '../types';

const C1 = '#00E5FF';
const C2 = '#FFB300';

export const ScoreBug: React.FC<{ point: PointData; teams: TeamNames }> = ({ point, teams }) => {
  const t1 = `${teams.team1.player1} / ${teams.team1.player2}`;
  const t2 = `${teams.team2.player1} / ${teams.team2.player2}`;
  const [g1 = '0', g2 = '0'] = (point.gameScore ?? '0-0').split('-');

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Score bug — bottom left */}
      <div style={{
        position: 'absolute',
        bottom: 52,
        left: 52,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}>
        {/* Game score row */}
        <div style={{
          background: 'rgba(5,8,12,0.88)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 10,
          padding: '8px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          backdropFilter: 'blur(12px)',
        }}>
          <span style={{ color: '#8A929E', fontSize: 14, fontWeight: 500 }}>
            {point.setScore ?? '0-0'}
            {point.matchScore ? ` · ${point.matchScore}` : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: C1, fontSize: 22, fontWeight: 800, minWidth: 36, textAlign: 'center', lineHeight: 1 }}>{g1}</span>
            <span style={{ color: '#2C3540', fontSize: 16, fontWeight: 400 }}>–</span>
            <span style={{ color: C2, fontSize: 22, fontWeight: 800, minWidth: 36, textAlign: 'center', lineHeight: 1 }}>{g2}</span>
          </div>
        </div>

        {/* Team names row */}
        <div style={{
          background: 'rgba(5,8,12,0.75)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 7,
          padding: '5px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ color: C1, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{t1}</span>
          <span style={{ color: '#2C3540', fontSize: 11 }}>vs</span>
          <span style={{ color: C2, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{t2}</span>
        </div>
      </div>

      {/* Point counter — top right */}
      <div style={{
        position: 'absolute',
        top: 36,
        right: 52,
        background: 'rgba(5,8,12,0.78)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 7,
        padding: '6px 14px',
        backdropFilter: 'blur(8px)',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      }}>
        <span style={{ color: '#8A929E', fontSize: 13 }}>Point </span>
        <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>
          {point.pointNumber}
        </span>
        <span style={{ color: '#4A5568', fontSize: 13 }}>/{point.totalPoints}</span>
      </div>

      {/* Winner flash — top left, only if winner known */}
      {point.winner && point.howWon && (
        <div style={{
          position: 'absolute',
          top: 36,
          left: 52,
          background: point.winner === 'team1' ? 'rgba(0,229,255,0.12)' : 'rgba(255,179,0,0.12)',
          border: `1px solid ${point.winner === 'team1' ? 'rgba(0,229,255,0.3)' : 'rgba(255,179,0,0.3)'}`,
          borderRadius: 7,
          padding: '5px 12px',
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        }}>
          <span style={{
            color: point.winner === 'team1' ? C1 : C2,
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}>
            {point.winner === 'team1' ? teams.team1.player1 : teams.team2.player1}
            {' · '}
            {point.shotType ?? point.howWon}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
