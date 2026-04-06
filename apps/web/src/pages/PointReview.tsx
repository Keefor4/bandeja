import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  doc, getDoc, updateDoc, addDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import VideoPlayer, { type VideoPlayerHandle } from '../components/VideoPlayer';
import PlayerIdentificationModal from '../components/PlayerIdentificationModal';
import type { DetectedPoint, Match, ShotType, HowWon, MatchPlayers } from '@bandeja/shared';
import { SHOT_GROUPS, SHOT_LABELS, HOW_WON_LABELS } from '@bandeja/shared';

type Action = 'approved' | 'rejected' | 'skipped';

interface TagDraft {
  winner: 'team1' | 'team2' | null;
  winnerAuto: boolean;
  shotType: ShotType | null;
  howWon: HowWon | null;
  rallyLength: number;
}

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

// ── Tag Panel ──────────────────────────────────────────────────────────────

function TagPanel({
  point,
  players,
  draft,
  onDraftChange,
  onSave,
  saving,
}: {
  point: DetectedPoint & { id: string };
  players: MatchPlayers | null;
  draft: TagDraft;
  onDraftChange: (d: Partial<TagDraft>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const wd = point.winnerDetection;
  const needsManualWinner = !wd || wd.needsReview || wd.winner === null;
  const aiConfPct = wd ? Math.round(wd.confidence * 100) : 0;

  const team1Label = players
    ? `${players.team1.player1} / ${players.team1.player2}`
    : 'Team 1';
  const team2Label = players
    ? `${players.team2.player1} / ${players.team2.player2}`
    : 'Team 2';

  const tagComplete = draft.winner !== null && draft.howWon !== null;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg-2)' }}>
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'rgba(0,200,83,0.2)', background: 'rgba(0,200,83,0.06)' }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.5" stroke="var(--green)" strokeWidth="1.5"/>
          <path d="M4 6.5l2 2 3-3" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>Point approved — tag it</span>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">

        {/* Winner */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontSize: 10 }}>Winner</p>
            {wd && !needsManualWinner && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,200,83,0.1)', color: 'var(--green)', border: '1px solid rgba(0,200,83,0.2)' }}>
                AI {aiConfPct}%
              </span>
            )}
            {needsManualWinner && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,179,0,0.1)', color: 'var(--amber)', border: '1px solid rgba(255,179,0,0.2)' }}>
                Manual required
              </span>
            )}
          </div>

          {/* AI reason (if available) */}
          {wd?.reason && (
            <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              {wd.reason}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {(['team1', 'team2'] as const).map(t => {
              const label = t === 'team1' ? team1Label : team2Label;
              const isSelected = draft.winner === t;
              return (
                <button
                  key={t}
                  onClick={() => onDraftChange({ winner: t, winnerAuto: false })}
                  className="px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150"
                  style={{
                    background: isSelected
                      ? (t === 'team1' ? 'rgba(0,229,255,0.12)' : 'rgba(255,179,0,0.12)')
                      : 'var(--surface)',
                    border: isSelected
                      ? (t === 'team1' ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(255,179,0,0.4)')
                      : '1px solid var(--border)',
                    color: isSelected
                      ? (t === 'team1' ? 'var(--cyan)' : 'var(--amber)')
                      : 'var(--text-2)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* How won */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)', fontSize: 10 }}>How won</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(HOW_WON_LABELS) as [HowWon, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => onDraftChange({ howWon: key })}
                className="px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-all duration-150"
                style={{
                  background: draft.howWon === key ? 'rgba(0,229,255,0.1)' : 'var(--surface)',
                  border: draft.howWon === key ? '1px solid rgba(0,229,255,0.35)' : '1px solid var(--border)',
                  color: draft.howWon === key ? 'var(--cyan)' : 'var(--text-2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Finishing shot */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)', fontSize: 10 }}>
            Finishing shot <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </p>
          {SHOT_GROUPS.map(group => (
            <div key={group.label} className="mb-3">
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-3)', opacity: 0.6 }}>{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.shots.map(shot => (
                  <button
                    key={shot}
                    onClick={() => onDraftChange({ shotType: draft.shotType === shot ? null : shot })}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                    style={{
                      background: draft.shotType === shot ? 'rgba(0,229,255,0.1)' : 'var(--surface)',
                      border: draft.shotType === shot ? '1px solid rgba(0,229,255,0.35)' : '1px solid var(--border)',
                      color: draft.shotType === shot ? 'var(--cyan)' : 'var(--text-2)',
                    }}
                  >
                    {SHOT_LABELS[shot]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Rally length */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontSize: 10 }}>Rally length</p>
            <span className="text-xs mono" style={{ color: 'var(--text-2)' }}>{draft.rallyLength} shots</span>
          </div>
          <input
            type="range" min={1} max={30} step={1}
            value={draft.rallyLength}
            onChange={e => onDraftChange({ rallyLength: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* Save */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={onSave}
          disabled={!tagComplete || saving}
          className="btn-cyan w-full py-2.5 text-sm disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save & next →'}
        </button>
        {!tagComplete && (
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-3)' }}>
            Select winner + how won to continue
          </p>
        )}
      </div>
    </div>
  );
}

// ── Score tracker ──────────────────────────────────────────────────────────

type Score = { sets: [number, number][]; games: [number, number]; points: [number, number] };

const TENNIS_POINTS = ['0', '15', '30', '40', 'AD'];

function advanceScore(score: Score, winner: 0 | 1): Score {
  const pts = [...score.points] as [number, number];
  const gms = [...score.games] as [number, number];
  const sts = score.sets.map(s => [...s]) as [number, number][];

  pts[winner]++;
  const [p1, p2] = pts;

  // Deuce / advantage
  const isDeuce = p1 >= 3 && p2 >= 3;
  if (isDeuce) {
    if (p1 - p2 >= 2) { gms[winner]++; pts[0] = 0; pts[1] = 0; }
    else if (p2 - p1 >= 2) { gms[winner === 0 ? 1 : 0]++; pts[0] = 0; pts[1] = 0; }
  } else if (pts[winner] >= 4) {
    gms[winner]++; pts[0] = 0; pts[1] = 0;
  }

  // Game → set
  const [g1, g2] = gms;
  const isTiebreak = g1 === 6 && g2 === 6;
  const setWon = (!isTiebreak && (
    (g1 >= 6 && g1 - g2 >= 2) || (g2 >= 6 && g2 - g1 >= 2) || g1 === 7 || g2 === 7
  )) || (isTiebreak && (
    (g1 >= 7 && g1 - g2 >= 2) || (g2 >= 7 && g2 - g1 >= 2)
  ));

  if (setWon) {
    sts.push([g1, g2]);
    gms[0] = 0; gms[1] = 0;
  }

  return { sets: sts, games: gms as [number, number], points: pts as [number, number] };
}

function scoreToStrings(score: Score, players: MatchPlayers | null) {
  const t1 = players ? `${players.team1.player1}/${players.team1.player2}` : 'T1';
  const t2 = players ? `${players.team2.player1}/${players.team2.player2}` : 'T2';
  const [p1, p2] = score.points;
  const isDeuce = p1 >= 3 && p2 >= 3;
  const ptLabel = isDeuce
    ? (p1 === p2 ? 'Deuce' : p1 > p2 ? `Adv ${t1}` : `Adv ${t2}`)
    : `${TENNIS_POINTS[p1]}-${TENNIS_POINTS[p2]}`;
  const gameScore = ptLabel;
  const setScore = `${score.games[0]}-${score.games[1]}`;
  const lastSets = score.sets.slice(-3);
  const matchScore = lastSets.map(s => `${s[0]}-${s[1]}`).join(', ') || '0-0';
  const setNumber = score.sets.length + 1;
  return { gameScore, setScore, matchScore, setNumber };
}

// ══════════════════════════════════════════════════════════════════════════
export default function PointReview() {
  const { matchId } = useParams<{ matchId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<MatchPlayers | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [points, setPoints] = useState<(DetectedPoint & { id: string })[]>([]);
  const [idx, setIdx] = useState(0);
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustStart, setAdjustStart] = useState(0);
  const [adjustEnd, setAdjustEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  // Tagging state
  const [taggingPoint, setTaggingPoint] = useState<(DetectedPoint & { id: string }) | null>(null);
  const [pendingCorrected, setPendingCorrected] = useState<{ start: number; end: number } | null>(null);
  const [tagDraft, setTagDraft] = useState<TagDraft>({
    winner: null, winnerAuto: false, shotType: null, howWon: null, rallyLength: 4,
  });
  const [savingTag, setSavingTag] = useState(false);

  // Running score
  const [score, setScore] = useState<Score>({ sets: [], games: [0, 0], points: [0, 0] });
  const approvedCount = useRef(0);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const point = taggingPoint ?? points[idx] ?? null;
  const isTagging = taggingPoint !== null;

  const ctxStart = Math.max(0, (point?.startTime ?? 0) - 120);
  const ctxEnd   = (point?.endTime ?? 0) + 120;
  const playStart = adjustMode ? ctxStart : (point?.startTime ?? 0);
  const playEnd   = adjustMode ? ctxEnd   : (point?.endTime ?? 0);

  const videoSrc = match ? `/storage/${match.videoPath}` : '';

  useEffect(() => {
    if (!matchId) return;
    (async () => {
      const matchSnap = await getDoc(doc(db, 'matches', matchId));
      if (matchSnap.exists()) {
        const m = matchSnap.data() as Match;
        setMatch(m);
        if (m.players) setPlayers(m.players);
      }
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
    if (point && !isTagging) {
      setAdjustStart(point.startTime);
      setAdjustEnd(point.endTime);
      setAdjustMode(false);
      setIsPlaying(true);
    }
  }, [idx, point?.id, isTagging]);

  // Pre-fill tag draft from AI winner detection
  const openTagging = useCallback((pt: DetectedPoint & { id: string }, corrected?: { start: number; end: number }) => {
    const wd = pt.winnerDetection;
    setTaggingPoint(pt);
    setPendingCorrected(corrected ?? null);
    setTagDraft({
      winner: (wd && !wd.needsReview && wd.winner) ? wd.winner : null,
      winnerAuto: !!(wd && !wd.needsReview && wd.winner),
      shotType: null,
      howWon: null,
      rallyLength: Math.max(1, Math.round(pt.duration / 1.5)),
    });
  }, []);

  const submitDecision = useCallback(async (action: Action, corrected?: { start: number; end: number }) => {
    if (!points[idx] || !profile || submitting) return;
    const pt = points[idx];
    setSubmitting(true);
    try {
      if (action !== 'skipped') {
        const newStatus = corrected ? 'corrected' : action === 'approved' ? 'approved' : 'rejected';
        await updateDoc(doc(db, 'points', pt.id), {
          status: newStatus,
          reviewedBy: profile.uid,
          reviewedAt: serverTimestamp(),
          ...(corrected && { correctedStartTime: corrected.start, correctedEndTime: corrected.end }),
        });
        await addDoc(collection(db, 'feedback'), {
          matchId: pt.matchId, pointId: pt.id,
          action: corrected ? 'corrected' : action,
          reviewerId: profile.uid,
          originalStartTime: pt.startTime, originalEndTime: pt.endTime,
          originalConfidence: pt.confidence, originalSignals: pt.detectionSignals,
          ...(corrected && { correctedStartTime: corrected.start, correctedEndTime: corrected.end }),
          videoMetadata: match?.metadata ?? {},
          timestamp: serverTimestamp(),
        });
        if (action === 'approved' || corrected) {
          const ms = await getDoc(doc(db, 'matches', pt.matchId));
          if (ms.exists()) {
            await updateDoc(doc(db, 'matches', pt.matchId), {
              pointsApproved: ((ms.data() as Match).pointsApproved ?? 0) + 1,
              updatedAt: serverTimestamp(),
            });
          }
          // Open tagging panel
          openTagging(pt, corrected);
          return; // don't advance yet — tagging panel will advance
        }
      }
      idx + 1 >= points.length ? setDone(true) : setIdx(i => i + 1);
    } finally {
      setSubmitting(false);
    }
  }, [points, idx, profile, submitting, match, openTagging]);

  const saveTag = useCallback(async () => {
    if (!taggingPoint || !profile || !tagDraft.winner || !tagDraft.howWon || savingTag) return;
    setSavingTag(true);
    try {
      const newScore = advanceScore(score, tagDraft.winner === 'team1' ? 0 : 1);
      const { gameScore, setScore: setScoreStr, matchScore, setNumber } = scoreToStrings(newScore, players);

      await setDoc(doc(db, 'pointStats', taggingPoint.id), {
        pointId: taggingPoint.id,
        matchId: taggingPoint.matchId,
        setNumber,
        gameScore,
        setScore: setScoreStr,
        matchScore,
        winner: tagDraft.winner,
        winnerSource: tagDraft.winnerAuto ? 'ai' : 'manual',
        howWon: tagDraft.howWon,
        ...(tagDraft.shotType && { finishingShot: tagDraft.shotType }),
        rallyLength: tagDraft.rallyLength,
        taggedBy: profile.uid,
        taggedAt: serverTimestamp(),
      });

      setScore(newScore);
      approvedCount.current++;

      // After every 10 approved points — prompt for player ID if not set yet
      if (!players && approvedCount.current >= 10) {
        setShowPlayerModal(true);
      }

      setTaggingPoint(null);
      setPendingCorrected(null);
      idx + 1 >= points.length ? setDone(true) : setIdx(i => i + 1);
    } finally {
      setSavingTag(false);
    }
  }, [taggingPoint, profile, tagDraft, score, players, idx, points.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || isTagging) return;
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
  }, [submitDecision, adjustMode, adjustStart, adjustEnd, isTagging]);

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
  const { gameScore, setScore: setScoreStr, matchScore } = scoreToStrings(score, players);

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Header ──────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-4 px-4 py-3 border-b"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--border)', zIndex: 20 }}>

        <button onClick={() => navigate('/')} className="btn-ghost px-3 py-1.5 text-xs">← Queue</button>

        <div className="h-4 w-px" style={{ background: 'var(--border)' }} />

        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-sm font-medium truncate block" style={{ color: 'var(--text-1)' }}>{match.title}</span>

          {/* Live score */}
          {(score.sets.length > 0 || score.games[0] + score.games[1] > 0) && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs mono shrink-0"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              {score.sets.map((s, i) => (
                <span key={i}>{s[0]}-{s[1]}</span>
              ))}
              <span style={{ color: 'var(--border)', margin: '0 2px' }}>·</span>
              <span style={{ color: 'var(--text-1)' }}>{setScoreStr}</span>
              <span style={{ color: 'var(--border)', margin: '0 2px' }}>·</span>
              <span style={{ color: 'var(--cyan)' }}>{gameScore}</span>
            </div>
          )}
        </div>

        {/* Player ID button (admin) */}
        {profile?.role === 'admin' && (
          <button
            onClick={() => setShowPlayerModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--text-3)', background: 'var(--surface)', border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          >
            {players ? '✎ Players' : '+ Add players'}
          </button>
        )}

        {/* Progress */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs mono" style={{ color: 'var(--text-3)' }}>{idx + 1} / {points.length}</span>
          <div className="w-28 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%`, background: 'var(--cyan)' }} />
          </div>
        </div>

        {/* Shortcuts legend */}
        {!isTagging && (
          <div className="hidden lg:flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
            <kbd>A</kbd><span>Approve</span>
            <kbd>R</kbd><span>Reject</span>
            <kbd>E</kbd><span>Adjust</span>
            <kbd>S</kbd><span>Skip</span>
            <kbd>Space</kbd><span>Play</span>
          </div>
        )}
      </header>

      {/* ── Body ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Point list sidebar */}
        <aside className="w-52 shrink-0 overflow-y-auto border-r flex flex-col"
          style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
          <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontSize: 10 }}>Points · low confidence first</p>
          </div>
          {points.map((p, i) => (
            <button
              key={p.id}
              onClick={() => { if (!isTagging) setIdx(i); }}
              disabled={isTagging}
              className="w-full text-left px-3 py-2.5 border-b transition-colors disabled:cursor-not-allowed"
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
              <span style={{ color: 'var(--border)' }}>·</span>
              <span className="mono" style={{ color: 'var(--text-2)' }}>{point.duration.toFixed(1)}s</span>
              <span style={{ color: 'var(--border)' }}>·</span>
              <ConfidencePill value={point.confidence} />
            </div>
            {adjustMode && (
              <div className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--cyan-glow)', border: '1px solid rgba(0,229,255,0.4)', color: 'var(--cyan)' }}>
                Adjust mode
              </div>
            )}
            {isTagging && (
              <div className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.4)', color: 'var(--green)' }}>
                Tagging
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
        <aside className="w-72 shrink-0 flex flex-col border-l overflow-hidden"
          style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>

          {isTagging ? (
            <TagPanel
              point={taggingPoint!}
              players={players}
              draft={tagDraft}
              onDraftChange={d => setTagDraft(prev => ({ ...prev, ...d }))}
              onSave={saveTag}
              saving={savingTag}
            />
          ) : (
            <>
              {/* Detection signals */}
              <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)', fontSize: 10 }}>Detection signals</p>
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

              {/* Winner detection preview */}
              {point.winnerDetection && (
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)', fontSize: 10 }}>AI winner detection</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: point.winnerDetection.needsReview ? 'var(--amber)' : 'var(--green)' }}>
                      {point.winnerDetection.winner
                        ? (point.winnerDetection.winner === 'team1'
                          ? (players?.team1.player1 ?? 'Team 1')
                          : (players?.team2.player1 ?? 'Team 2'))
                        : '—'}
                    </span>
                    <ConfidencePill value={point.winnerDetection.confidence} />
                    {point.winnerDetection.needsReview && (
                      <span className="text-xs" style={{ color: 'var(--amber)' }}>Review</span>
                    )}
                  </div>
                  {point.winnerDetection.reason && (
                    <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                      {point.winnerDetection.reason}
                    </p>
                  )}
                </div>
              )}

              {/* Adjust sliders */}
              {adjustMode && (
                <div className="px-4 py-4 border-b" style={{ borderColor: 'rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.04)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--cyan)', fontSize: 10 }}>Adjust boundaries</p>
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
              <div className="px-4 py-4 space-y-2 mt-auto border-t" style={{ borderColor: 'var(--border)' }}>
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
            </>
          )}
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

      {/* ── Player identification modal ──────────────── */}
      {showPlayerModal && matchId && (
        <PlayerIdentificationModal
          matchId={matchId}
          onClose={() => setShowPlayerModal(false)}
          onSaved={p => { setPlayers(p); setShowPlayerModal(false); }}
        />
      )}
    </div>
  );
}
