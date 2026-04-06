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
        if (data.frames?.length) {
          setFrames(data.frames);
        } else {
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
          {/* Frame viewer */}
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            {loadingFrames ? (
              <div className="h-40 flex items-center justify-center gap-2" style={{ color: 'var(--text-3)' }}>
                <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--cyan)' }} />
                <span className="text-sm">Extracting frames…</span>
              </div>
            ) : frameError ? (
              <div className="h-40 flex items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>
                {frameError}
              </div>
            ) : (
              <>
                {/* Main frame */}
                <div className="relative rounded-xl overflow-hidden mb-3" style={{ background: '#000' }}>
                  <img
                    src={`data:image/jpeg;base64,${frames[activeFrame]}`}
                    alt={`Frame ${activeFrame + 1}`}
                    className="w-full object-contain"
                    style={{ maxHeight: '280px' }}
                  />
                  {/* Frame label overlay */}
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded text-xs mono"
                    style={{ background: 'rgba(0,0,0,0.7)', color: 'var(--text-2)' }}>
                    Frame {activeFrame + 1}/{frames.length}
                  </div>
                </div>

                {/* Thumbnails */}
                <div className="flex gap-2">
                  {frames.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveFrame(i)}
                      className="flex-1 rounded-lg overflow-hidden transition-all duration-150"
                      style={{
                        border: i === activeFrame
                          ? '2px solid var(--cyan)'
                          : '2px solid var(--border)',
                        opacity: i === activeFrame ? 1 : 0.55,
                      }}
                    >
                      <img
                        src={`data:image/jpeg;base64,${f}`}
                        alt={`Thumb ${i + 1}`}
                        className="w-full object-cover"
                        style={{ height: '52px' }}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Name inputs */}
          <div className="p-5 space-y-5">
            {/* Team 1 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--cyan)' }} />
                <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--cyan)' }}>Team 1</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['player1', 'player2'] as const).map((pl, i) => (
                  <div key={pl}>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>
                      Player {i + 1}
                    </label>
                    <input
                      ref={el => { inputRefs.current[i] = el; }}
                      type="text"
                      value={names.team1[pl]}
                      onChange={e => setName('team1', pl, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') inputRefs.current[i + 1]?.focus();
                      }}
                      placeholder="Player name"
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-1)',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,229,255,0.5)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs mono" style={{ color: 'var(--text-3)' }}>vs</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            {/* Team 2 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--amber)' }} />
                <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--amber)' }}>Team 2</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['player1', 'player2'] as const).map((pl, i) => (
                  <div key={pl}>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>
                      Player {i + 1}
                    </label>
                    <input
                      ref={el => { inputRefs.current[i + 2] = el; }}
                      type="text"
                      value={names.team2[pl]}
                      onChange={e => setName('team2', pl, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (i + 2 < 3) inputRefs.current[i + 3]?.focus();
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
                      onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,179,0,0.5)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
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
