import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Match } from '@bandeja/shared';

const BADGE: Record<string, string> = {
  uploaded: 'badge-uploaded', processing: 'badge-processing',
  detected: 'badge-detected',  reviewing: 'badge-reviewing',
  approved: 'badge-approved',  complete: 'badge-complete',
  error: 'badge-error',
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Uploaded', processing: 'Processing', detected: 'Ready',
  reviewing: 'In Review', approved: 'Approved', complete: 'Complete', error: 'Error',
};

function MatchCard({
  match, onClaim, claiming, isMine, isTaken,
}: {
  match: Match & { id: string };
  onClaim: () => void;
  claiming: boolean;
  isMine: boolean;
  isTaken: boolean;
}) {
  const progress = match.pointsDetected > 0
    ? Math.round((match.pointsApproved / match.pointsDetected) * 100) : 0;

  return (
    <div
      className="card p-5 flex gap-4 items-start transition-all duration-200 fade-up"
      style={{ opacity: isTaken ? 0.45 : 1 }}
    >
      {/* Thumbnail placeholder */}
      <div className="shrink-0 w-24 h-16 rounded-lg flex items-center justify-center overflow-hidden"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <polygon points="7,5 16,10 7,15" fill="var(--text-3)" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{match.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[match.status] ?? BADGE.uploaded}`}>
                {STATUS_LABEL[match.status] ?? match.status}
              </span>
              {isMine && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--cyan-glow)', color: 'var(--cyan)', border: '1px solid rgba(0,229,255,0.25)' }}>
                  Your review
                </span>
              )}
            </div>
          </div>

          {isTaken ? (
            <span className="text-xs shrink-0" style={{ color: 'var(--text-3)' }}>Taken</span>
          ) : (
            <button
              onClick={onClaim}
              disabled={claiming}
              className="btn-cyan shrink-0 px-4 py-1.5 text-xs disabled:opacity-50"
            >
              {claiming ? '…' : isMine ? 'Continue →' : 'Review →'}
            </button>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs mb-3" style={{ color: 'var(--text-3)' }}>
          {match.pointsDetected > 0 && (
            <span className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="4.5" opacity="0.3"/><path d="M5 2v3l2 1" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round"/></svg>
              {match.pointsDetected} points
            </span>
          )}
          {match.pointsApproved > 0 && (
            <span className="flex items-center gap-1" style={{ color: 'var(--green)' }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {match.pointsApproved} approved
            </span>
          )}
          {match.metadata?.resolution && <span>{match.metadata.resolution}</span>}
        </div>

        {/* Progress bar */}
        {match.pointsDetected > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: progress === 100 ? 'var(--green)' : 'var(--cyan)' }}
              />
            </div>
            <span className="text-xs mono shrink-0" style={{ color: 'var(--text-3)' }}>{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<(Match & { id: string })[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'matches'),
      where('status', 'in', ['detected', 'reviewing']),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as Match) }));
      if (profile?.role === 'admin') {
        setMatches(all);
      } else {
        setMatches(all.filter(m =>
          !(m as any).claimedBy || (m as any).claimedBy === profile?.uid
        ));
      }
    });
  }, [profile]);

  const claimAndReview = async (matchId: string) => {
    setClaiming(matchId);
    try {
      await updateDoc(doc(db, 'matches', matchId), {
        claimedBy: profile?.uid,
        claimedAt: serverTimestamp(),
        status: 'reviewing',
        updatedAt: serverTimestamp(),
      });
      navigate(`/review/${matchId}`);
    } finally {
      setClaiming(null);
    }
  };

  const pending = matches.filter(m => !(m as any).claimedBy || (m as any).claimedBy === profile?.uid);
  const taken   = matches.filter(m => (m as any).claimedBy && (m as any).claimedBy !== profile?.uid);

  return (
    <div className="min-h-dvh flex" style={{ background: 'var(--bg)' }}>

      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r" style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <circle cx="11" cy="11" r="8" stroke="var(--cyan)" strokeWidth="2"/>
            <line x1="3.5" y1="3.5" x2="8" y2="8" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round"/>
            <line x1="14" y1="14" x2="24" y2="24" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-1)' }}>Bandeja</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface)', color: 'var(--cyan)', border: '1px solid rgba(0,229,255,0.15)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
              <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/>
              <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/>
              <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
            </svg>
            Queue
          </div>
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: 'var(--surface-3)', color: 'var(--cyan)' }}>
              {profile?.displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{profile?.displayName}</div>
              <div className="text-xs capitalize" style={{ color: 'var(--text-3)' }}>{profile?.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full text-xs py-1.5 rounded-lg text-left px-2 transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 px-8 py-4 flex items-center justify-between border-b"
          style={{ background: 'rgba(8,11,15,0.85)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Match Queue</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {pending.length} match{pending.length !== 1 ? 'es' : ''} available
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs mono px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--green)' }} />
            Live
          </div>
        </div>

        <div className="px-8 py-6 max-w-3xl">

          {pending.length === 0 && taken.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="9" cy="9" r="7" stroke="var(--text-3)" strokeWidth="1.5"/>
                  <line x1="2.5" y1="2.5" x2="7" y2="7" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="11" y1="11" x2="21" y2="21" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>No matches in queue</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Upload a match video to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((match, i) => (
                <div key={match.id} style={{ animationDelay: `${i * 50}ms` }}>
                  <MatchCard
                    match={match}
                    onClaim={() => claimAndReview(match.id)}
                    claiming={claiming === match.id}
                    isMine={(match as any).claimedBy === profile?.uid}
                    isTaken={false}
                  />
                </div>
              ))}
              {taken.length > 0 && (
                <>
                  <p className="text-xs font-medium pt-2 pb-1" style={{ color: 'var(--text-3)' }}>Being reviewed by others</p>
                  {taken.map(match => (
                    <MatchCard key={match.id} match={match} onClaim={() => {}} claiming={false} isMine={false} isTaken />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
