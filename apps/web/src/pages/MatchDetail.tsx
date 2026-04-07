import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection, doc, getDocs, onSnapshot, orderBy, query, where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { DetectedPoint, Match } from '@bandeja/shared';

interface PointStats {
  winner?: 'team1' | 'team2';
  howWon?: string;
  finishingShot?: string;
  rallyLength?: number;
  gameScore?: string;
  setScore?: string;
  setNumber?: number;
}

interface RenderOptions {
  quickHighlight: number; // 0 = all
  includeMusic: boolean;
  playerHighlight: string; // '' = none
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    rendering: 'badge badge-rendering',
    complete:  'badge badge-complete',
    error:     'badge badge-error',
    approved:  'badge badge-detected',
    reviewing: 'badge badge-reviewing',
    uploaded:  'badge badge-uploaded',
    processing:'badge badge-processing',
    detected:  'badge badge-detected',
  };
  return (
    <span className={cls[status] ?? 'badge badge-uploaded'}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [match, setMatch] = useState<(Match & { id: string }) | null>(null);
  const [points, setPoints] = useState<(DetectedPoint & { id: string })[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, PointStats>>({});
  const [renderOpts, setRenderOpts] = useState<RenderOptions>({
    quickHighlight: 0,
    includeMusic: false,
    playerHighlight: '',
  });
  const [triggering, setTriggering] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const playerNames: string[] = match?.players
    ? [
        match.players.team1.player1,
        match.players.team1.player2,
        match.players.team2.player1,
        match.players.team2.player2,
      ]
    : [];

  // Live match listener (for render progress)
  useEffect(() => {
    if (!matchId) return;
    const unsub = onSnapshot(doc(db, 'matches', matchId), snap => {
      if (snap.exists()) setMatch({ ...(snap.data() as Match), id: snap.id });
    });
    return unsub;
  }, [matchId]);

  // Fetch approved points + stats once
  useEffect(() => {
    if (!matchId) return;
    (async () => {
      const q = query(
        collection(db, 'points'),
        where('matchId', '==', matchId),
        where('status', 'in', ['approved', 'corrected']),
        orderBy('pointNumber', 'asc'),
      );
      const snap = await getDocs(q);
      setPoints(snap.docs.map(d => ({ ...(d.data() as DetectedPoint), id: d.id })));

      const statsSnap = await getDocs(
        query(collection(db, 'pointStats'), where('matchId', '==', matchId)),
      );
      const sm: Record<string, PointStats> = {};
      statsSnap.docs.forEach(d => { sm[d.id] = d.data() as PointStats; });
      setStatsMap(sm);
    })();
  }, [matchId]);

  const triggerRender = async () => {
    if (!matchId || triggering) return;
    setTriggering(true);
    try {
      await fetch(`/api/render/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickHighlight: renderOpts.quickHighlight || undefined,
          includeMusic: renderOpts.includeMusic,
          playerHighlight: renderOpts.playerHighlight || undefined,
        }),
      });
      setShowOptions(false);
    } finally {
      setTriggering(false);
    }
  };

  if (!match) return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--cyan)' }} />
    </div>
  );

  const isRendering = match.status === 'rendering';
  const isComplete = match.status === 'complete';
  const isError = match.status === 'error';
  const canRender = ['detected', 'reviewing', 'approved', 'complete', 'error'].includes(match.status) && !isRendering;
  const progress = match.renderProgress ?? 0;

  const t1 = match.players ? `${match.players.team1.player1} / ${match.players.team1.player2}` : 'Team 1';
  const t2 = match.players ? `${match.players.team2.player1} / ${match.players.team2.player2}` : 'Team 2';

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <header className="sticky top-0 z-20 px-6 h-14 flex items-center gap-4 border-b"
        style={{ background: 'rgba(9,9,10,0.92)', backdropFilter: 'blur(16px)', borderColor: 'var(--border)' }}>
        <button onClick={() => navigate('/')} className="btn-ghost px-3 py-1.5 text-xs shrink-0">
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none" style={{ marginRight: 4 }}>
            <path d="M11 5H1M1 5L5 1M1 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Queue
        </button>
        <div className="h-4 w-px shrink-0" style={{ background: 'var(--border)' }} />
        <h1 className="text-sm font-semibold truncate flex-1" style={{ color: 'var(--text-1)' }}>{match.title}</h1>
        <StatusBadge status={match.status} />
      </header>

      <div className="flex-1 px-6 py-6 max-w-4xl mx-auto w-full space-y-5">

        {/* Match info + render card */}
        <div className="card p-5 space-y-5">

          {/* Teams + stats row */}
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontSize: 10 }}>Match</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm font-bold" style={{ color: 'var(--cyan)' }}>{t1}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>vs</span>
                <span className="text-sm font-bold" style={{ color: 'var(--amber)' }}>{t2}</span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontSize: 10 }}>Approved</p>
              <div className="flex items-baseline justify-end gap-1 mt-1">
                <span className="text-2xl font-bold mono" style={{ color: 'var(--text-1)' }}>{match.pointsApproved}</span>
                <span className="text-sm" style={{ color: 'var(--text-3)' }}>/ {match.pointsDetected}</span>
              </div>
            </div>
          </div>

          {/* Error message */}
          {isError && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)' }}>
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--red, #ff3b30)' }}>Processing error</p>
                <p className="text-xs font-mono break-all" style={{ color: 'var(--text-3)' }}>
                  {(match as any).renderError ?? (match as any).errorMessage ?? 'Unknown error — check server logs.'}
                </p>
              </div>
            </div>
          )}

          {/* Render progress bar */}
          {isRendering && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between text-xs mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="spinner" style={{ color: 'var(--amber)', width: 12, height: 12 }} />
                  <span style={{ color: 'var(--amber)' }}>Rendering highlight…</span>
                </div>
                <span className="mono" style={{ color: 'var(--text-3)' }}>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%`, background: 'var(--amber)' }} />
              </div>
            </div>
          )}

          {/* Download */}
          {isComplete && match.renderPath && (
            <div className="pt-4 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                <span className="text-xs" style={{ color: 'var(--green)' }}>Highlight ready to download</span>
              </div>
              <a
                href={`/storage/${match.renderPath}`}
                download
                className="btn-cyan px-4 py-1.5 text-xs"
              >
                <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
                  <path d="M5.5 1v7M5.5 8L2.5 5M5.5 8l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 10.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Download MP4
              </a>
            </div>
          )}

          {/* Generate section */}
          {canRender && profile?.role === 'admin' && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              {!showOptions ? (
                <button onClick={() => setShowOptions(true)} className="btn-cyan px-5 py-2 text-xs">
                  {isComplete ? 'Re-render highlight' : isError ? 'Retry render →' : 'Generate highlight →'}
                </button>
              ) : (
                <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontSize: 10 }}>Render options</p>

                  {/* Quick highlight */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>Include points</label>
                    <select
                      value={renderOpts.quickHighlight}
                      onChange={e => setRenderOpts(o => ({ ...o, quickHighlight: Number(e.target.value) }))}
                      className="field-input field-select"
                    >
                      <option value={0}>All approved points ({match.pointsApproved})</option>
                      {[5, 10, 15, 20].filter(n => n < match.pointsApproved).map(n => (
                        <option key={n} value={n}>Top {n} by rally length</option>
                      ))}
                    </select>
                  </div>

                  {/* Player highlight */}
                  {playerNames.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
                        Player reel <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(9:16 · 30s · optional)</span>
                      </label>
                      <select
                        value={renderOpts.playerHighlight}
                        onChange={e => setRenderOpts(o => ({ ...o, playerHighlight: e.target.value }))}
                        className="field-input field-select"
                      >
                        <option value="">Full match highlight (16:9)</option>
                        {playerNames.map(n => (
                          <option key={n} value={n}>{n} reel</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Music */}
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={renderOpts.includeMusic}
                      onChange={e => setRenderOpts(o => ({ ...o, includeMusic: e.target.checked }))}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                      Include background music <span style={{ color: 'var(--text-3)' }}>(replaces match audio)</span>
                    </span>
                  </label>

                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={triggerRender} disabled={triggering} className="btn-cyan px-5 py-2 text-xs">
                      {triggering ? <><div className="spinner" /> Starting…</> : 'Start render →'}
                    </button>
                    <button onClick={() => setShowOptions(false)} className="btn-ghost px-4 py-2 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Points table */}
        {points.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontSize: 10 }}>
                Approved points
              </p>
              <span className="badge badge-detected">{points.length}</span>
            </div>
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Dur</th>
                    <th>Score</th>
                    <th>Winner</th>
                    <th>How won</th>
                    <th>Shot</th>
                    <th>Rally</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map(p => {
                    const s = statsMap[p.id];
                    const start = p.correctedStartTime ?? p.startTime;
                    const end = p.correctedEndTime ?? p.endTime;
                    const dur = (end - start).toFixed(1);
                    const m = Math.floor(start / 60);
                    const sec = Math.floor(start % 60).toString().padStart(2, '0');
                    return (
                      <tr key={p.id}>
                        <td className="mono font-semibold" style={{ color: 'var(--text-1)' }}>{p.pointNumber}</td>
                        <td className="mono" style={{ color: 'var(--text-3)' }}>{m}:{sec}</td>
                        <td className="mono" style={{ color: 'var(--text-3)' }}>{dur}s</td>
                        <td className="mono" style={{ color: 'var(--text-1)' }}>{s?.gameScore ?? '—'}</td>
                        <td>
                          {s?.winner ? (
                            <span className="text-xs font-semibold" style={{ color: s.winner === 'team1' ? 'var(--cyan)' : 'var(--amber)' }}>
                              {s.winner === 'team1'
                                ? match.players?.team1.player1 ?? 'Team 1'
                                : match.players?.team2.player1 ?? 'Team 2'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{s?.howWon?.replace(/_/g, ' ') ?? '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{s?.finishingShot?.replace(/_/g, ' ') ?? '—'}</td>
                        <td className="mono">{s?.rallyLength ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {points.length === 0 && match.pointsDetected > 0 && (
          <div className="card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No approved points yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              Start reviewing to approve points.
            </p>
            <button onClick={() => navigate(`/review/${matchId}`)} className="btn-cyan px-5 py-2 text-xs mt-4">
              Open review →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
