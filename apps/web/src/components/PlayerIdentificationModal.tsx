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

interface Marker { pctX: number; pctY: number; }

const SLOTS = [
  { team: 'team1' as const, pl: 'player1' as const, label: 'Team 1 · Player 1', accent: 'var(--cyan)',  focusColor: 'rgba(184,255,64,0.5)' },
  { team: 'team1' as const, pl: 'player2' as const, label: 'Team 1 · Player 2', accent: 'var(--cyan)',  focusColor: 'rgba(184,255,64,0.5)' },
  { team: 'team2' as const, pl: 'player1' as const, label: 'Team 2 · Player 1', accent: 'var(--amber)', focusColor: 'rgba(255,179,0,0.5)'  },
  { team: 'team2' as const, pl: 'player2' as const, label: 'Team 2 · Player 2', accent: 'var(--amber)', focusColor: 'rgba(255,179,0,0.5)'  },
] as const;

const MARKER_COLORS = ['var(--cyan)', 'var(--cyan)', 'var(--amber)', 'var(--amber)'];

/** Extract a JPEG crop (230×300) from a base64 frame, centered on (cx, cy) in natural px */
function extractCrop(frameB64: string, cx: number, cy: number): Promise<string> {
  return new Promise(resolve => {
    const W = 230, H = 300;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      const x1 = Math.max(0, Math.min(img.naturalWidth  - W, cx - W / 2));
      const y1 = Math.max(0, Math.min(img.naturalHeight - H, cy - H / 2));
      ctx.drawImage(img, x1, y1, W, H, 0, 0, W, H);
      resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.src = `data:image/jpeg;base64,${frameB64}`;
  });
}

export default function PlayerIdentificationModal({ matchId, onClose, onSaved }: Props) {
  const [fullFrame, setFullFrame]       = useState('');
  const [autoCrops, setAutoCrops]       = useState<string[]>([]);
  const [manualCrops, setManualCrops]   = useState<string[]>([]);
  const [markers, setMarkers]           = useState<Marker[]>([]);
  const [manualMode, setManualMode]     = useState(false);
  const [loadingFrames, setLoadingFrames] = useState(true);
  const [frameError, setFrameError]     = useState('');
  const [names, setNames]               = useState({ team1: { player1: '', player2: '' }, team2: { player1: '', player2: '' } });
  const [saving, setSaving]             = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const frameImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`/api/players/frames/${matchId}`);
        const data = await res.json();
        if (data.frames?.[0])         setFullFrame(data.frames[0]);
        if (data.player_crops?.length) setAutoCrops(data.player_crops);
        if (!data.frames?.[0] && !data.player_crops?.length)
          setFrameError(data.error ?? 'No frames available');
      } catch {
        setFrameError('Could not load frames');
      } finally {
        setLoadingFrames(false);
      }
    })();
  }, [matchId]);

  // Auto-enter manual mode when auto-detection found nothing
  useEffect(() => {
    if (!loadingFrames && autoCrops.length === 0 && fullFrame)
      setManualMode(true);
  }, [loadingFrames, autoCrops.length, fullFrame]);

  // Focus first input once loaded
  useEffect(() => {
    if (!loadingFrames && !manualMode)
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, [loadingFrames, manualMode]);

  // Which crops to display — manual overrides auto
  const displayCrops = manualCrops.length > 0 ? manualCrops : autoCrops;

  const setName = (team: 'team1' | 'team2', player: 'player1' | 'player2', val: string) =>
    setNames(prev => ({ ...prev, [team]: { ...prev[team], [player]: val } }));

  const allFilled = SLOTS.every(s => names[s.team][s.pl].trim().length > 0);

  /** Handle click on the full-frame image to place a marker */
  const handleFrameClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!manualMode || markers.length >= 4 || !fullFrame) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pctX = (e.clientX - rect.left)  / rect.width;
    const pctY = (e.clientY - rect.top)   / rect.height;
    // Natural image is 1280×720
    const actualX = Math.round(pctX * 1280);
    const actualY = Math.round(pctY * 720);
    const slotIdx = markers.length;
    setMarkers(prev => [...prev, { pctX, pctY }]);
    const crop = await extractCrop(fullFrame, actualX, actualY);
    setManualCrops(prev => { const n = [...prev]; n[slotIdx] = crop; return n; });
  };

  const resetMarkers = () => { setMarkers([]); setManualCrops([]); };

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
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full flex flex-col overflow-hidden fade-up"
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 20, maxHeight: '92vh', maxWidth: 780,
        }}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Identify players</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {manualMode
                ? `Click on each player in the frame below (${markers.length}/4 marked)`
                : 'Enter each player\'s name — or switch to manual marking'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!loadingFrames && !frameError && fullFrame && (
              manualMode ? (
                <button
                  onClick={() => { setManualMode(false); resetMarkers(); }}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Use auto crops
                </button>
              ) : (
                <button
                  onClick={() => { setManualMode(true); resetMarkers(); }}
                  className="btn-ghost px-3 py-1.5 text-xs"
                  style={{ borderColor: 'rgba(184,255,64,0.3)', color: 'var(--cyan)' }}
                >
                  Mark manually
                </button>
              )
            )}
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0"
              style={{ color: 'var(--text-3)', background: 'var(--surface)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
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
            <div className="p-5 space-y-4">

              {/* ── Full frame — always visible in manual mode, collapsible otherwise ── */}
              {fullFrame && (
                manualMode ? (
                  <div>
                    {/* Instruction banner */}
                    {markers.length < 4 && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2 text-xs font-medium"
                        style={{ background: 'rgba(184,255,64,0.08)', border: '1px solid rgba(184,255,64,0.2)', color: 'var(--cyan)' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M6 4v4M6 3v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        Click on <strong style={{ color: 'var(--text-1)' }}>{SLOTS[markers.length].label}</strong> in the frame
                        {markers.length > 0 && (
                          <button onClick={resetMarkers}
                            className="ml-auto text-xs px-2 py-0.5 rounded"
                            style={{ color: 'var(--text-3)', background: 'var(--surface)' }}>
                            Reset
                          </button>
                        )}
                      </div>
                    )}
                    {markers.length === 4 && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg mb-2 text-xs"
                        style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: 'var(--green)' }}>
                        <span>All 4 players marked — enter their names below</span>
                        <button onClick={resetMarkers}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ color: 'var(--text-3)', background: 'var(--surface)' }}>
                          Redo
                        </button>
                      </div>
                    )}

                    {/* Clickable court frame */}
                    <div className="relative rounded-xl overflow-hidden" style={{ background: '#000' }}>
                      <img
                        ref={frameImgRef}
                        src={`data:image/jpeg;base64,${fullFrame}`}
                        alt="Court — click to mark players"
                        className="w-full block"
                        style={{
                          maxHeight: 280,
                          objectFit: 'contain',
                          cursor: markers.length < 4 ? 'crosshair' : 'default',
                          userSelect: 'none',
                        }}
                        onClick={handleFrameClick}
                        draggable={false}
                      />
                      {/* Numbered marker pins */}
                      {markers.map((m, i) => (
                        <div key={i}
                          className="absolute flex items-center justify-center text-xs font-bold pointer-events-none"
                          style={{
                            left: `${m.pctX * 100}%`,
                            top:  `${m.pctY * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            width: 26, height: 26,
                            borderRadius: '50%',
                            background: MARKER_COLORS[i],
                            color: '#0A0905',
                            boxShadow: '0 0 0 2px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.7)',
                            fontSize: 12,
                          }}
                        >
                          {i + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <details className="group">
                    <summary className="text-xs cursor-pointer select-none flex items-center gap-1.5 mb-1"
                      style={{ color: 'var(--text-3)' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
                        className="transition-transform group-open:rotate-90">
                        <polygon points="2,1 8,5 2,9"/>
                      </svg>
                      Show full court frame
                    </summary>
                    <div className="rounded-xl overflow-hidden mt-2" style={{ background: '#000' }}>
                      <img src={`data:image/jpeg;base64,${fullFrame}`} alt="Court"
                        className="w-full object-contain" style={{ maxHeight: 200 }} />
                    </div>
                  </details>
                )
              )}

              {/* ── Player slots ── */}
              {SLOTS.map(({ team, pl, label, accent, focusColor }, slotIdx) => {
                const showDivider = slotIdx === 2;
                const showTeamHeader = slotIdx === 0 || slotIdx === 2;
                const crop = displayCrops[slotIdx];
                const hasMarker = markers.length > slotIdx;
                const isNext = manualMode && markers.length === slotIdx;

                return (
                  <div key={`${team}-${pl}`}>
                    {showDivider && (
                      <div className="flex items-center gap-3 my-2">
                        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                        <span className="text-xs mono" style={{ color: 'var(--text-3)' }}>vs</span>
                        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                      </div>
                    )}
                    {showTeamHeader && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
                        <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: accent }}>
                          {slotIdx === 0 ? 'Team 1' : 'Team 2'}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-3 mb-3 items-start">
                      {/* Crop thumbnail */}
                      <div
                        className="shrink-0 rounded-xl overflow-hidden"
                        style={{
                          width: 120, height: 150,
                          background: 'var(--surface)',
                          border: `2px solid ${crop ? accent : isNext ? 'rgba(184,255,64,0.4)' : 'var(--border)'}`,
                          position: 'relative',
                          transition: 'border-color 200ms',
                        }}
                      >
                        {crop ? (
                          <img src={`data:image/jpeg;base64,${crop}`} alt={label}
                            className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"
                            style={{ color: isNext ? 'var(--cyan)' : 'var(--text-3)' }}>
                            {isNext ? (
                              <>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/>
                                  <path d="M10 6v4M10 14v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <span className="text-xs font-medium" style={{ fontSize: 10 }}>Click frame</span>
                              </>
                            ) : (
                              <span className="text-xs font-bold" style={{ opacity: 0.35 }}>{slotIdx + 1}</span>
                            )}
                          </div>
                        )}
                        {/* Numbered badge on filled crops */}
                        {crop && (
                          <div className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: accent, color: '#0A0905', fontSize: 10 }}>
                            {slotIdx + 1}
                          </div>
                        )}
                        {/* Manual marker used indicator */}
                        {manualMode && hasMarker && (
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs"
                            style={{ background: 'rgba(0,0,0,0.7)', color: 'var(--text-2)', fontSize: 9 }}>
                            manual
                          </div>
                        )}
                      </div>

                      {/* Name input */}
                      <div className="flex-1">
                        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</label>
                        <input
                          ref={el => { inputRefs.current[slotIdx] = el; }}
                          type="text"
                          value={names[team][pl]}
                          onChange={e => setName(team, pl, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (slotIdx < 3) inputRefs.current[slotIdx + 1]?.focus();
                              else if (allFilled) save();
                            }
                          }}
                          placeholder="Player name"
                          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                          onFocus={e => e.currentTarget.style.borderColor = focusColor}
                          onBlur={e  => e.currentTarget.style.borderColor = 'var(--border)'}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 border-t flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={!allFilled || saving}
            className="btn-cyan px-6 py-2 text-sm disabled:opacity-40">
            {saving ? 'Saving…' : 'Confirm players →'}
          </button>
        </div>
      </div>
    </div>
  );
}
