import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  doc, getDoc, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import VideoPlayer, { type VideoPlayerHandle } from '../components/VideoPlayer';
import type { DetectedPoint, Match } from '@bandeja/shared';

type Action = 'approved' | 'rejected' | 'skipped';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
  const bg = pct >= 70 ? 'rgba(0,200,83,0.1)' : pct >= 40 ? 'rgba(255,179,0,0.1)' : 'rgba(255,61,87,0.1)';
  const border = pct >= 70 ? 'rgba(0,200,83,0.25)' : pct >= 40 ? 'rgba(255,179,0,0.25)' : 'rgba(255,61,87,0.25)';
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {pct}%
    </span>
  );
}

function ActionButton({
  label, shortcut, onClick, disabled, variant,
}: {
  label: string; shortcut: string; onClick: () => void;
  disabled?: boolean; variant: 'approve' | 'reject' | 'adjust' | 'skip' | 'active';
}) {
  const styles = {
    approve: { bg: 'rgba(0,200,83,0.08)', border: 'rgba(0,200,83,0.25)', color: 'var(--green)',  hover: 'rgba(0,200,83,0.15)' },
    reject:  { bg: 'rgba(255,61,87,0.08)',  border: 'rgba(255,61,87,0.25)',  color: 'var(--red)',    hover: 'rgba(255,61,87,0.15)' },
    adjust:  { bg: 'rgba(0,229,255,0.06)',  border: 'rgba(0,229,255,0.2)',   color: 'var(--cyan)',   hover: 'rgba(0,229,255,0.12)' },
    active:  { bg: 'rgba(0,229,255,0.12)',  border: 'rgba(0,229,255,0.4)',   color: 'var(--cyan)',   hover: 'rgba(0,229,255,0.18)' },
    skip:    { bg: 'transparent',           border: 'var(--border)',         color: 'var(--text-3)', hover: 'var(--surface-2)' },
  };
  const s = styles[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = s.hover)}
      onMouseLeave={e => !disabled && (e.currentTarget.style.background = s.bg)}
    >
      <span>{label}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}

export default function PointReview() {
  const { matchId } = useParams<{ matchId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [match, setMatch] = useState<Match | null>(null);
  const [points, setPoints] = useState<(DetectedPoint & { id: string })[]>([]);
  const [idx, setIdx] = useState(0);
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustStart, setAdjustStart] = useState(0);
  const [adjustEnd, setAdjustEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const point = points[idx] ?? null;

  const ctxStart = Math.max(0, (point?.startTime ?? 0) - 120);
  const ctxEnd   = (point?.endTime ?? 0) + 120;
  const playStart = adjustMode ? ctxStart : (point?.startTime ?? 0);
  const playEnd   = adjustMode ? ctxEnd   : (point?.endTime ?? 0);

  const videoSrc = match
    ? `/storage/${match.videoPath}`
    : '';

  useEffect(() => {
    if (!matchId) return;
    (async () => {
      const matchSnap = await getDoc(doc(db, 'matches', matchId));
      if (matchSnap.exists()) setMatch(matchSnap.data() as Match);
      const q = query(
        collection(db, 'points'),
        where('matchId', '==', matchId),
        where('status', '==', 'pending'),
        orderBy('confidence', 'asc')
      );
      const snap = await getDocs(q);
      setPoints(snap.docs.map(d => ({ id: d.id, ...(d.data() as DetectedPoint) })));
    })();
  }, [matchId]);

  useEffect(() => {
    if (point) {
      setAdjustStart(point.startTime);
      setAdjustEnd(point.endTime);
      setAdjustMode(false);
      setIsPlaying(true);
    }
  }, [idx, point?.id]);

  const submitDecision = useCallback(async (action: Action, corrected?: { start: number; end: number }) => {
    if (!point || !profile || submitting) return;
    setSubmitting(true);
    try {
      if (action !== 'skipped') {
        const newStatus = corrected ? 'corrected' : action === 'approved' ? 'approved' : 'rejected';
        await updateDoc(doc(db, 'points', point.id), {
          status: newStatus,
          reviewedBy: profile.uid,
          reviewedAt: serverTimestamp(),
          ...(corrected && { correctedStartTime: corrected.start, correctedEndTime: corrected.end }),
        });
        await addDoc(collection(db, 'feedback'), {
          matchId: point.matchId, pointId: point.id,
          action: corrected ? 'corrected' : action,
          reviewerId: profile.uid,
          originalStartTime: point.startTime, originalEndTime: point.endTime,
          originalConfidence: point.confidence, originalSignals: point.detectionSignals,
          ...(corrected && { correctedStartTime: corrected.start, correctedEndTime: corrected.end }),
          videoMetadata: match?.metadata ?? {},
          timestamp: serverTimestamp(),
        });
        if (action === 'approved' || corrected) {
          const ms = await getDoc(doc(db, 'matches', point.matchId));
          if (ms.exists()) {
            await updateDoc(doc(db, 'matches', point.matchId), {
              pointsApproved: ((ms.data() as Match).pointsApproved ?? 0) + 1,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
      idx + 1 >= points.length ? setDone(true) : setIdx(i => i + 1);
    } finally {
      setSubmitting(false);
    }
  }, [point, profile, submitting, idx, points.length, match]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'a': case 'A': submitDecision('approved'); break;
        case 'r': case 'R': submitDecision('rejected'); break;
        case 's': case 'S': submitDecision('skipped'); break;
        case 'e': case 'E': setAdjustMode(v => !v); break;
        case ' ':
          e.preventDefault();
          playerRef.current?.togglePlay();
          setIsPlaying(v => !v);
          break;
        case 'ArrowLeft':  playerRef.current?.seek(e.shiftKey ? -5 : -1); break;
        case 'ArrowRight': playerRef.current?.seek(e.shiftKey ? 5 : 1); break;
        case 'Enter':
          if (adjustMode) submitDecision('approved', { start: adjustStart, end: adjustEnd });
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitDecision, adjustMode, adjustStart, adjustEnd]);

  /* ── Done screen ─────────────────────────────────── */
  if (done) return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="text-center fade-up">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14l5.5 5.5L22 8" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Review complete</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>All pending points reviewed — great work.</p>
        <button onClick={() => navigate('/')} className="btn-cyan px-6 py-2.5 text-sm">← Back to queue</button>
      </div>
    </div>
  );

  if (!point || !match) return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
        <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--cyan)' }} />
        Loading…
      </div>
    </div>
  );

  const progress = idx / Math.max(points.length, 1);

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Header ──────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-4 px-4 py-3 border-b"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--border)', zIndex: 20 }}>

        <button onClick={() => navigate('/')} className="btn-ghost px-3 py-1.5 text-xs">← Queue</button>

        <div className="h-4 w-px" style={{ background: 'var(--border)' }} />

        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block" style={{ color: 'var(--text-1)' }}>{match.title}</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs mono" style={{ color: 'var(--text-3)' }}>{idx + 1} / {points.length}</span>
          <div className="w-28 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%`, background: 'var(--cyan)' }} />
          </div>
        </div>

        {/* Shortcuts legend */}
        <div className="hidden lg:flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
          <kbd>A</kbd><span>Approve</span>
          <kbd>R</kbd><span>Reject</span>
          <kbd>E</kbd><span>Adjust</span>
          <kbd>S</kbd><span>Skip</span>
          <kbd>Space</kbd><span>Play</span>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Point list sidebar */}
        <aside className="w-52 shrink-0 overflow-y-auto border-r flex flex-col"
          style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
          <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>Points — lowest confidence first</p>
          </div>
          {points.map((p, i) => (
            <button
              key={p.id}
              onClick={() => { setIdx(i); }}
              className="w-full text-left px-3 py-2.5 border-b transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: i === idx ? 'var(--surface)' : 'transparent',
                borderLeft: i === idx ? '2px solid var(--cyan)' : '2px solid transparent',
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium" style={{ color: i === idx ? 'var(--text-1)' : 'var(--text-2)' }}>
                  #{p.pointNumber}
                </span>
                <ConfidencePill value={p.confidence} />
              </div>
              <div className="text-xs mono" style={{ color: 'var(--text-3)' }}>
                {formatTime(p.startTime)} → {formatTime(p.endTime)}
              </div>
            </button>
          ))}
        </aside>

        {/* Video */}
        <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
          <VideoPlayer
            ref={playerRef}
            src={videoSrc}
            startTime={playStart}
            endTime={playEnd}
            onTimeUpdate={setCurrentTime}
            autoPlay
            className="w-full h-full object-contain"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          />

          {/* Overlay: point info */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(8,11,15,0.85)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>Point #{point.pointNumber}</span>
              <span style={{ color: 'var(--border-2)' }}>·</span>
              <span className="mono" style={{ color: 'var(--text-2)' }}>{point.duration.toFixed(1)}s</span>
              <span style={{ color: 'var(--border-2)' }}>·</span>
              <ConfidencePill value={point.confidence} />
            </div>
            {adjustMode && (
              <div className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--cyan-glow)', border: '1px solid rgba(0,229,255,0.4)', color: 'var(--cyan)' }}>
                Adjust mode
              </div>
            )}
          </div>

          {/* Overlay: play/pause center click */}
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => { playerRef.current?.togglePlay(); setIsPlaying(v => !v); }}
          />
        </div>

        {/* Right panel */}
        <aside className="w-64 shrink-0 flex flex-col border-l overflow-y-auto"
          style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>

          {/* Detection signals */}
          <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-3)' }}>Detection signals</p>
            <div className="space-y-2.5">
              {Object.entries(point.detectionSignals).map(([key, val]) =>
                val !== undefined ? (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-3)' }}>
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                      </span>
                      <span className="mono" style={{ color: 'var(--text-2)' }}>{Math.round((val as number) * 100)}%</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${(val as number) * 100}%`,
                          background: (val as number) >= 0.7 ? 'var(--green)'
                            : (val as number) >= 0.4 ? 'var(--amber)'
                            : 'var(--red)',
                        }} />
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* Adjust sliders */}
          {adjustMode && (
            <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(0,229,255,0.03)' }}>
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--cyan)' }}>Adjust boundaries</p>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span style={{ color: 'var(--text-3)' }}>Start</span>
                    <span className="mono" style={{ color: 'var(--cyan)' }}>{formatTime(adjustStart)}</span>
                  </div>
                  <input type="range" min={ctxStart} max={adjustEnd - 1} step={0.1}
                    value={adjustStart}
                    onChange={e => { setAdjustStart(Number(e.target.value)); playerRef.current?.seekTo(Number(e.target.value)); }}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span style={{ color: 'var(--text-3)' }}>End</span>
                    <span className="mono" style={{ color: 'var(--cyan)' }}>{formatTime(adjustEnd)}</span>
                  </div>
                  <input type="range" min={adjustStart + 1} max={ctxEnd} step={0.1}
                    value={adjustEnd}
                    onChange={e => setAdjustEnd(Number(e.target.value))}
                  />
                </div>
                <button
                  onClick={() => submitDecision('approved', { start: adjustStart, end: adjustEnd })}
                  disabled={submitting}
                  className="btn-cyan w-full py-2 text-xs"
                >
                  Save & approve <kbd className="ml-1 bg-[#0D1117] border-cyan-400/30">↵</kbd>
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="px-4 py-4 space-y-2 mt-auto">
            <ActionButton label="Approve" shortcut="A" variant="approve"
              onClick={() => submitDecision('approved')} disabled={submitting || adjustMode} />
            <ActionButton label="Reject" shortcut="R" variant="reject"
              onClick={() => submitDecision('rejected')} disabled={submitting || adjustMode} />
            <ActionButton label={adjustMode ? 'Exit adjust' : 'Adjust boundaries'} shortcut="E"
              variant={adjustMode ? 'active' : 'adjust'}
              onClick={() => setAdjustMode(v => !v)} disabled={submitting} />
            <ActionButton label="Skip" shortcut="S" variant="skip"
              onClick={() => submitDecision('skipped')} disabled={submitting} />
          </div>
        </aside>
      </div>

      {/* ── Scrubber ─────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-t"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>

        <button
          onClick={() => { playerRef.current?.togglePlay(); setIsPlaying(v => !v); }}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-2)', background: 'var(--surface)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--cyan)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}
        >
          {isPlaying
            ? <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3.5" height="12"/><rect x="6.5" y="0" width="3.5" height="12"/></svg>
            : <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><polygon points="0,0 10,6 0,12"/></svg>
          }
        </button>

        <span className="mono text-xs shrink-0 w-16 text-right" style={{ color: 'var(--text-3)' }}>
          {formatTime(currentTime)}
        </span>

        <div className="flex-1">
          <input
            type="range"
            min={playStart} max={playEnd} step={0.1}
            value={Math.min(currentTime, playEnd)}
            onChange={e => playerRef.current?.seekTo(Number(e.target.value))}
          />
        </div>

        <span className="mono text-xs shrink-0 w-16" style={{ color: 'var(--text-3)' }}>
          {formatTime(playEnd)}
        </span>

        {/* Seek buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {[-5, -1, 1, 5].map(s => (
            <button key={s} onClick={() => playerRef.current?.seek(s)}
              className="text-xs px-2 py-1 rounded mono transition-colors"
              style={{ color: 'var(--text-3)', background: 'var(--surface)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              {s > 0 ? `+${s}s` : `${s}s`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
