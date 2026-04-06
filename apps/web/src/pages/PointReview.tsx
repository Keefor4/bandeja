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

  const playerRef = useRef<VideoPlayerHandle>(null);
  const point = points[idx] ?? null;

  // Effective window: normal or adjusted
  const winStart = adjustMode ? adjustStart : (point?.startTime ?? 0);
  const winEnd = adjustMode ? adjustEnd : (point?.endTime ?? 0);
  // Context window for adjust mode: 2 min before/after
  const ctxStart = Math.max(0, (point?.startTime ?? 0) - 120);
  const ctxEnd = (point?.endTime ?? 0) + 120;

  const videoSrc = match ? `/storage/matches/${encodeURIComponent(match.videoPath.replace('matches/', ''))}` : '';

  useEffect(() => {
    if (!matchId) return;
    (async () => {
      const matchSnap = await getDoc(doc(db, 'matches', matchId));
      if (matchSnap.exists()) setMatch(matchSnap.data() as Match);

      const q = query(
        collection(db, 'points'),
        where('matchId', '==', matchId),
        where('status', '==', 'pending'),
        orderBy('confidence', 'asc') // lowest confidence first
      );
      const snap = await getDocs(q);
      const pts = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DetectedPoint) }));
      setPoints(pts);
    })();
  }, [matchId]);

  useEffect(() => {
    if (point) {
      setAdjustStart(point.startTime);
      setAdjustEnd(point.endTime);
      setAdjustMode(false);
    }
  }, [idx, point?.id]);

  const submitDecision = useCallback(async (action: Action, corrected?: { start: number; end: number }) => {
    if (!point || !profile || submitting) return;
    setSubmitting(true);
    try {
      // Update point status
      const newStatus = action === 'approved' ? 'approved'
        : action === 'rejected' ? 'rejected'
        : 'pending'; // skipped goes back to pending

      if (action !== 'skipped') {
        await updateDoc(doc(db, 'points', point.id), {
          status: corrected ? 'corrected' : newStatus,
          reviewedBy: profile.uid,
          reviewedAt: serverTimestamp(),
          ...(corrected && {
            correctedStartTime: corrected.start,
            correctedEndTime: corrected.end,
          }),
        });

        // Write feedback entry for AI training
        await addDoc(collection(db, 'feedback'), {
          matchId: point.matchId,
          pointId: point.id,
          action: corrected ? 'corrected' : action,
          reviewerId: profile.uid,
          originalStartTime: point.startTime,
          originalEndTime: point.endTime,
          originalConfidence: point.confidence,
          originalSignals: point.detectionSignals,
          ...(corrected && {
            correctedStartTime: corrected.start,
            correctedEndTime: corrected.end,
          }),
          videoMetadata: match?.metadata ?? {},
          timestamp: serverTimestamp(),
        });

        // Update match approval count
        if (action === 'approved' || corrected) {
          const matchRef = doc(db, 'matches', point.matchId);
          const matchSnap = await getDoc(matchRef);
          if (matchSnap.exists()) {
            const current = (matchSnap.data() as Match).pointsApproved ?? 0;
            await updateDoc(matchRef, { pointsApproved: current + 1, updatedAt: serverTimestamp() });
          }
        }
      }

      // Advance to next point
      if (idx + 1 >= points.length) {
        setDone(true);
      } else {
        setIdx((i) => i + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }, [point, profile, submitting, idx, points.length, match]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'a': case 'A': submitDecision('approved'); break;
        case 'r': case 'R': submitDecision('rejected'); break;
        case 's': case 'S': submitDecision('skipped'); break;
        case 'e': case 'E': setAdjustMode((v) => !v); break;
        case ' ': e.preventDefault(); playerRef.current?.togglePlay(); break;
        case 'ArrowLeft': playerRef.current?.seek(e.shiftKey ? -5 : -1); break;
        case 'ArrowRight': playerRef.current?.seek(e.shiftKey ? 5 : 1); break;
        case 'Enter':
          if (adjustMode) {
            submitDecision('approved', { start: adjustStart, end: adjustEnd });
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitDecision, adjustMode, adjustStart, adjustEnd]);

  if (done) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-white mb-2">Review complete!</h2>
          <p className="text-slate-400 text-sm mb-6">You've reviewed all pending points for this match.</p>
          <button
            onClick={() => navigate('/')}
            className="bg-[#00e5ff] text-[#0f1117] font-semibold px-6 py-2.5 rounded-lg hover:bg-[#00c4d9] transition-colors text-sm"
          >
            Back to queue
          </button>
        </div>
      </div>
    );
  }

  if (!point || !match) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  const progress = idx / Math.max(points.length, 1);
  const confidence = Math.round(point.confidence * 100);

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2e3347] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors text-sm">← Back</button>
          <span className="text-slate-600">|</span>
          <span className="text-sm text-white font-medium truncate max-w-xs">{match.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">Point {idx + 1} of {points.length}</span>
          <div className="w-32 h-1.5 bg-[#2e3347] rounded-full overflow-hidden">
            <div className="h-full bg-[#00e5ff] rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Video */}
        <div className="flex-1 bg-black flex items-center justify-center">
          <VideoPlayer
            ref={playerRef}
            src={videoSrc}
            startTime={adjustMode ? ctxStart : point.startTime}
            endTime={adjustMode ? ctxEnd : point.endTime}
            onTimeUpdate={setCurrentTime}
            autoPlay
            className="w-full h-full object-contain max-h-[calc(100vh-120px)]"
          />
        </div>

        {/* Sidebar */}
        <aside className="w-72 bg-[#1a1d27] border-l border-[#2e3347] flex flex-col shrink-0">
          {/* Point info */}
          <div className="p-4 border-b border-[#2e3347]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Point #{point.pointNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                confidence >= 70 ? 'bg-green-500/20 text-green-400' :
                confidence >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {confidence}% confidence
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#0f1117] rounded-lg p-2">
                <div className="text-slate-500 mb-0.5">Duration</div>
                <div className="text-white font-medium">{point.duration.toFixed(1)}s</div>
              </div>
              <div className="bg-[#0f1117] rounded-lg p-2">
                <div className="text-slate-500 mb-0.5">Start</div>
                <div className="text-white font-medium">{formatTime(point.startTime)}</div>
              </div>
            </div>

            {/* Signal bars */}
            <div className="mt-3 space-y-1.5">
              {Object.entries(point.detectionSignals).map(([key, val]) => (
                val !== undefined && (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-20 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="flex-1 h-1 bg-[#2e3347] rounded-full overflow-hidden">
                      <div className="h-full bg-[#00e5ff]/60 rounded-full" style={{ width: `${(val as number) * 100}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{Math.round((val as number) * 100)}%</span>
                  </div>
                )
              ))}
            </div>
          </div>

          {/* Adjust mode controls */}
          {adjustMode && (
            <div className="p-4 border-b border-[#2e3347] space-y-3">
              <p className="text-xs text-[#00e5ff] font-medium">Adjust mode — drag boundaries</p>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Start: {formatTime(adjustStart)}</label>
                <input
                  type="range"
                  min={ctxStart}
                  max={adjustEnd - 1}
                  step={0.1}
                  value={adjustStart}
                  onChange={(e) => {
                    setAdjustStart(Number(e.target.value));
                    playerRef.current?.seekTo(Number(e.target.value));
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">End: {formatTime(adjustEnd)}</label>
                <input
                  type="range"
                  min={adjustStart + 1}
                  max={ctxEnd}
                  step={0.1}
                  value={adjustEnd}
                  onChange={(e) => setAdjustEnd(Number(e.target.value))}
                />
              </div>
              <button
                onClick={() => submitDecision('approved', { start: adjustStart, end: adjustEnd })}
                disabled={submitting}
                className="w-full bg-[#00e5ff] text-[#0f1117] font-semibold text-sm py-2 rounded-lg hover:bg-[#00c4d9] transition-colors disabled:opacity-50"
              >
                Save adjustment ↵
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="p-4 space-y-2 mt-auto">
            <p className="text-xs text-slate-600 mb-3 text-center">Keyboard: A · R · E · S · Space · ← →</p>

            <button
              onClick={() => submitDecision('approved')}
              disabled={submitting || adjustMode}
              className="w-full flex items-center justify-between bg-green-500/10 border border-green-500/30 text-green-400 font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-40"
            >
              <span>Approve</span>
              <kbd className="text-xs bg-[#0f1117] border border-[#2e3347] px-1.5 py-0.5 rounded">A</kbd>
            </button>
            <button
              onClick={() => submitDecision('rejected')}
              disabled={submitting || adjustMode}
              className="w-full flex items-center justify-between bg-red-500/10 border border-red-500/30 text-red-400 font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-40"
            >
              <span>Reject</span>
              <kbd className="text-xs bg-[#0f1117] border border-[#2e3347] px-1.5 py-0.5 rounded">R</kbd>
            </button>
            <button
              onClick={() => setAdjustMode((v) => !v)}
              disabled={submitting}
              className={`w-full flex items-center justify-between border font-medium text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40 ${
                adjustMode
                  ? 'bg-[#00e5ff]/10 border-[#00e5ff]/50 text-[#00e5ff]'
                  : 'bg-[#2e3347]/30 border-[#2e3347] text-slate-300 hover:bg-[#2e3347]/60'
              }`}
            >
              <span>Adjust boundaries</span>
              <kbd className="text-xs bg-[#0f1117] border border-[#2e3347] px-1.5 py-0.5 rounded">E</kbd>
            </button>
            <button
              onClick={() => submitDecision('skipped')}
              disabled={submitting}
              className="w-full flex items-center justify-between bg-[#2e3347]/20 border border-[#2e3347] text-slate-500 font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-[#2e3347]/40 hover:text-slate-300 transition-colors disabled:opacity-40"
            >
              <span>Skip</span>
              <kbd className="text-xs bg-[#0f1117] border border-[#2e3347] px-1.5 py-0.5 rounded">S</kbd>
            </button>
          </div>
        </aside>
      </div>

      {/* Scrubber */}
      <div className="h-12 bg-[#1a1d27] border-t border-[#2e3347] flex items-center px-4 gap-3 shrink-0">
        <span className="text-xs text-slate-500 font-mono w-14">{formatTime(currentTime)}</span>
        <div className="flex-1">
          <input
            type="range"
            min={adjustMode ? ctxStart : point.startTime}
            max={adjustMode ? ctxEnd : point.endTime}
            step={0.1}
            value={currentTime}
            onChange={(e) => playerRef.current?.seekTo(Number(e.target.value))}
          />
        </div>
        <span className="text-xs text-slate-500 font-mono w-14 text-right">
          {formatTime(adjustMode ? ctxEnd : point.endTime)}
        </span>
        <button
          onClick={() => playerRef.current?.togglePlay()}
          className="text-slate-300 hover:text-white transition-colors px-2"
        >
          ▶ / ⏸
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
