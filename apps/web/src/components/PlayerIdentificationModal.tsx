import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Props {
  matchId: string;
  onClose: () => void;
  onSaved: (players: Players) => void;
}

interface Players {
  team1: { player1: string; player2: string };
  team2: { player1: string; player2: string };
}

const POSITIONS = [
  { key: 'team1.player1', label: 'Team 1 · Player 1', side: 1 },
  { key: 'team1.player2', label: 'Team 1 · Player 2', side: 1 },
  { key: 'team2.player1', label: 'Team 2 · Player 1', side: 2 },
  { key: 'team2.player2', label: 'Team 2 · Player 2', side: 2 },
] as const;

export default function PlayerIdentificationModal({ matchId, onClose, onSaved }: Props) {
  const [frames, setFrames] = useState<string[]>([]);
  const [playerCrops, setPlayerCrops] = useState<string[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(true);
  const [frameError, setFrameError] = useState('');
  const [names, setNames] = useState({ team1: { player1: '', player2: '' }, team2: { player1: '', player2: '' } });
  const [saving, setSaving] = useState(false);
  const [activeFrame, setActiveFrame] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/players/frames/${matchId}`);
        const data = await res.json();
        if (data.player_crops?.length) {
          setPlayerCrops(data.player_crops);
        }
        if (data.frames?.length) {
          setFrames(data.frames);
        }
        if (!data.frames?.length && !data.player_crops?.length) {
          setFrameError(data.error ?? 'No frames available');
        }
      } catch {
        setFrameError('Could not load frames');
      } finally {
        setLoadingFrames(false);
      }
    })();
  }, [matchId]);

  // Focus first empty input after frames load
  useEffect(() => {
    if (!loadingFrames) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [loadingFrames]);

  const setName = (team: 'team1' | 'team2', player: 'player1' | 'player2', val: string) => {
    setNames(prev => ({ ...prev, [team]: { ...prev[team], [player]: val } }));
  };

  const allFilled = POSITIONS.every(p => {
    const [t, pl] = p.key.split('.') as ['team1' | 'team2', 'player1' | 'player2'];
    return names[t][pl].trim().length > 0;
  });

  const save = async () => {
    if (!allFilled || saving) return;
    setSaving(true);
    try {
      const trimmed: Players = {
        team1: { player1: names.team1.player1.trim(), player2: names.team1.player2.trim() },
        team2: { player1: names.team2.player1.trim(), player2: names.team2.player2.trim() },
      };
      await updateDoc(doc(db, 'matches', matchId), {
        players: { ...trimmed, identifiedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      });
      onSaved(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden fade-up"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Identify players</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              Review the court frames and enter each player's name
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--surface)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingFrames ? (
            <div className="h-48 flex items-center justify-center gap-2" style={{ color: 'var(--text-3)' }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--cyan)' }} />
              <span className="text-sm">Scanning for players…</span>
            </div>
          ) : frameError ? (
            <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>
              {frameError}
            </div>
          ) : (
            <div className="p-5">
              {/* Reference frame toggle */}
              {frames.length > 0 && (
                <details className="mb-4">
                  <summary className="text-xs cursor-pointer select-none mb-2" style={{ color: 'var(--text-3)' }}>
                    Show full court frame
                  </summary>
                  <div className="rounded-xl overflow-hidden" style={{ background: '#000' }}>
                    <img
                      src={`data:image/jpeg;base64,${frames[activeFrame]}`}
                      alt="Court overview"
                      className="w-full object-contain"
                      style={{ maxHeight: '200px' }}
                    />
                  </div>
                </details>
              )}

              {/* 2×2 player grid — crop + input per player */}
              {([
                { team: 'team1' as const, pl: 'player1' as const, idx: 0, cropIdx: 0, accent: 'var(--cyan)',  focusColor: 'rgba(184,255,64,0.5)', label: 'Team 1 · Left' },
                { team: 'team1' as const, pl: 'player2' as const, idx: 1, cropIdx: 1, accent: 'var(--cyan)',  focusColor: 'rgba(184,255,64,0.5)', label: 'Team 1 · Right' },
                { team: 'team2' as const, pl: 'player1' as const, idx: 2, cropIdx: 2, accent: 'var(--amber)', focusColor: 'rgba(255,179,0,0.5)',  label: 'Team 2 · Left' },
                { team: 'team2' as const, pl: 'player2' as const, idx: 3, cropIdx: 3, accent: 'var(--amber)', focusColor: 'rgba(255,179,0,0.5)',  label: 'Team 2 · Right' },
              ] as const).map(({ team, pl, idx, cropIdx, accent, focusColor, label }, rowIdx) => {
                // Team divider before team 2
                const divider = rowIdx === 2 ? (
                  <div key="divider" className="col-span-2 flex items-center gap-3 my-1">
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    <span className="text-xs mono" style={{ color: 'var(--text-3)' }}>vs</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  </div>
                ) : null;

                return (
                  <div key={`${team}-${pl}`}>
                    {divider}
                    {/* Team header at start of each team block */}
                    {(rowIdx === 0 || rowIdx === 2) && (
                      <div className="flex items-center gap-2 mb-3" style={{ marginTop: rowIdx === 2 ? '4px' : 0 }}>
                        <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
                        <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: accent }}>
                          {rowIdx === 0 ? 'Team 1' : 'Team 2'}
                        </span>
                      </div>
                    )}
                    {/* Row: crop + input side by side */}
                    <div className="flex gap-3 mb-3 items-start">
                      {/* Close-up crop */}
                      <div
                        className="shrink-0 rounded-xl overflow-hidden"
                        style={{
                          width: 80, height: 110,
                          background: 'var(--surface)',
                          border: `1px solid ${playerCrops[cropIdx] ? accent : 'var(--border)'}`,
                          opacity: playerCrops[cropIdx] ? 1 : 0.4,
                        }}
                      >
                        {playerCrops[cropIdx] ? (
                          <img
                            src={`data:image/jpeg;base64,${playerCrops[cropIdx]}`}
                            alt={label}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
                            ?
                          </div>
                        )}
                      </div>
                      {/* Label + input */}
                      <div className="flex-1">
                        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</label>
                        <input
                          ref={el => { inputRefs.current[idx] = el; }}
                          type="text"
                          value={names[team][pl]}
                          onChange={e => setName(team, pl, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (idx < 3) inputRefs.current[idx + 1]?.focus();
                              else if (allFilled) save();
                            }
                          }}
                          placeholder="Player name"
                          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-1)',
                          }}
                          onFocus={e => e.currentTarget.style.borderColor = focusColor}
                          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={!allFilled || saving}
            className="btn-cyan px-6 py-2 text-sm disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Confirm players →'}
          </button>
        </div>
      </div>
    </div>
  );
}
