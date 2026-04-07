import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import UploadModal from '../components/UploadModal';
import type { Match } from '@bandeja/shared';

/**
 * Parses camera filenames like "Court5 03 04 2026 08 30 14 10 25 06 000 2L 1L 192.168.194.5 c729c678"
 * Returns { title: "Court 5 · Apr 3, 2026 · 08:30", id: "c729c678" }
 */
function formatMatchTitle(raw: string): { title: string; id: string | null } {
  // Match: CourtN DD MM YYYY HH MM ...
  const m = raw.match(/^Court(\d+)\s+(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{2})\s+(\d{2})/i);
  if (!m) return { title: raw, id: null };

  const courtNum = m[1];
  const day = parseInt(m[2], 10);
  const month = parseInt(m[3], 10) - 1; // 0-indexed
  const year = parseInt(m[4], 10);
  const hour = m[5];
  const minute = m[6];

  const date = new Date(year, month, day);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = `Court ${courtNum} · ${dateStr} · ${hour}:${minute}`;

  // Extract trailing hash/IP — last token that looks like a short hex hash
  const tokens = raw.split(/\s+/);
  const hashToken = tokens.findLast(t => /^[a-f0-9]{6,12}$/i.test(t)) ?? null;

  return { title, id: hashToken };
}

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Uploaded', processing: 'Processing', detected: 'Ready',
  reviewing: 'In Review', approved: 'Approved', rendering: 'Rendering',
  complete: 'Complete', error: 'Error',
};

const BADGE_CLASS: Record<string, string> = {
  uploaded: 'badge-uploaded', processing: 'badge-processing',
  detected: 'badge-detected', reviewing: 'badge-reviewing',
  approved: 'badge-approved', rendering: 'badge-rendering',
  complete: 'badge-complete', error: 'badge-error',
};

// Color accent per status for the card left border
const STATUS_ACCENT: Record<string, string> = {
  detected:  'var(--cyan)',
  reviewing: 'var(--purple)',
  rendering: 'var(--amber)',
  complete:  'var(--green)',
};

function MatchCard({
  match, onClaim, onView, claiming, isMine, isTaken,
}: {
  match: Match & { id: string };
  onClaim: () => void;
  onView: () => void;
  claiming: boolean;
  isMine: boolean;
  isTaken: boolean;
}) {
  const total = match.pointsDetected ?? 0;
  const approved = match.pointsApproved ?? 0;
  const progress = total > 0 ? Math.round((approved / total) * 100) : 0;
  const isComplete = match.status === 'complete';
  const { title: formattedTitle, id: matchShortId } = formatMatchTitle(match.title);
  const isRendering = match.status === 'rendering';
  const isProcessing = match.status === 'processing' || match.status === 'uploaded';
  const processingProgress = match.processingProgress ?? 0;
  const accent = STATUS_ACCENT[match.status] ?? 'var(--border-2)';

  return (
    <div
      className="card fade-up"
      style={{
        opacity: isTaken ? 0.42 : 1,
        borderLeft: `3px solid ${isTaken ? 'var(--border)' : accent}`,
        borderRadius: '14px',
        transition: 'box-shadow 200ms ease, transform 150ms ease',
      }}
      onMouseEnter={e => {
        if (!isTaken) {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      <div className="flex gap-4 p-5">
        {/* Thumbnail */}
        <div className="shrink-0 w-[100px] h-[68px] rounded-lg overflow-hidden flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%)`,
            border: '1px solid var(--border)',
          }}>
          {isComplete ? (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M5 11l4 4 8-8" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : isRendering ? (
            <div className="spinner" style={{ color: 'var(--amber)', width: 18, height: 18 }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M7 4.5l9 5.5-9 5.5V4.5z" fill="var(--text-3)"/>
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold truncate leading-tight" style={{ color: 'var(--text-1)' }}>
                {formattedTitle}
              </h3>
              {matchShortId && (
                <p className="mono text-xs truncate mb-1" style={{ color: 'var(--text-3)', fontSize: 11 }}>
                  ID: {matchShortId}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`badge ${BADGE_CLASS[match.status] ?? 'badge-uploaded'}`}>
                  {STATUS_LABEL[match.status] ?? match.status}
                </span>
                {isMine && (
                  <span className="badge" style={{ background: 'var(--cyan-bg)', color: 'var(--cyan)', borderColor: 'rgba(184,255,64,0.22)' }}>
                    Your review
                  </span>
                )}
              </div>
            </div>

            {isTaken ? (
              <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }}>Taken</span>
            ) : isProcessing ? (
              <span className="text-xs shrink-0 mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--amber)' }}>
                <div className="spinner" style={{ color: 'var(--amber)', width: 12, height: 12 }} /> Detecting…
              </span>
            ) : (isComplete || isRendering) ? (
              <button onClick={onView} className="btn-ghost shrink-0 px-3.5 py-2">
                {isRendering ? (
                  <><div className="spinner" style={{ color: 'var(--amber)', width: 12, height: 12 }} /> Rendering</>
                ) : 'View →'}
              </button>
            ) : (
              <button onClick={onClaim} disabled={claiming} className="btn-cyan shrink-0 px-4 py-2">
                {claiming ? <><div className="spinner" /> Loading</> : isMine ? 'Continue →' : 'Review →'}
              </button>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
            {total > 0 && (
              <span className="flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <path d="M5.5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {total} points
              </span>
            )}
            {approved > 0 && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--green)' }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {approved} approved
              </span>
            )}
            {match.metadata?.resolution && (
              <span className="mono" style={{ fontSize: 11 }}>{match.metadata.resolution}</span>
            )}
            {isRendering && match.renderProgress != null && (
              <span style={{ color: 'var(--amber)' }} className="mono">{match.renderProgress}%</span>
            )}
          </div>

          {/* Processing progress bar */}
          {isProcessing && (
            <div className="flex items-center gap-2.5 mt-3">
              <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${processingProgress}%`, background: 'var(--amber)' }} />
              </div>
              <span className="text-xs mono shrink-0" style={{ color: 'var(--amber)', fontSize: 11 }}>{processingProgress}%</span>
            </div>
          )}

          {/* Review progress bar */}
          {total > 0 && !isComplete && !isProcessing && (
            <div className="flex items-center gap-2.5 mt-3">
              <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progress}%`, background: progress === 100 ? 'var(--green)' : 'var(--cyan)' }} />
              </div>
              <span className="text-xs mono shrink-0" style={{ color: 'var(--text-3)', fontSize: 11 }}>{progress}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<(Match & { id: string })[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'matches'),
      where('status', 'in', ['uploaded', 'processing', 'detected', 'reviewing', 'rendering', 'complete']),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ ...(d.data() as Match), id: d.id }));
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

  const initials = profile?.displayName?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="min-h-dvh flex" style={{ background: 'var(--bg)' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-60 shrink-0 flex flex-col border-r"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>

        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--cyan-bg)', border: '1px solid rgba(184,255,64,0.2)' }}>
              <svg width="14" height="17" viewBox="0 0 20 24" fill="none">
                <ellipse cx="10" cy="9" rx="8.2" ry="8.5" stroke="var(--cyan)" strokeWidth="1.6"/>
                <circle cx="7.5" cy="7.5" r="0.9" fill="var(--cyan)" fillOpacity="0.5"/>
                <circle cx="10" cy="7"   r="0.9" fill="var(--cyan)" fillOpacity="0.5"/>
                <circle cx="12.5" cy="7.5" r="0.9" fill="var(--cyan)" fillOpacity="0.5"/>
                <circle cx="7.5" cy="10.5" r="0.9" fill="var(--cyan)" fillOpacity="0.5"/>
                <circle cx="10" cy="11"  r="0.9" fill="var(--cyan)" fillOpacity="0.5"/>
                <circle cx="12.5" cy="10.5" r="0.9" fill="var(--cyan)" fillOpacity="0.5"/>
                <path d="M7 17.5h6"  stroke="var(--cyan)" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M10 17.5V22" stroke="var(--cyan)" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>Bandeja</div>
              <div className="text-xs" style={{ color: 'var(--text-3)', fontSize: 10 }}>Review Console</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <button className="nav-item active" style={{ cursor: 'default' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.65"/>
              <rect x="7.5" y="1" width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
              <rect x="1" y="7.5" width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
              <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.65"/>
            </svg>
            Match Queue
          </button>
          {profile?.role === 'admin' && (
            <button onClick={() => navigate('/feedback')} className="nav-item">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 10V13h3l7-7-3-3-7 7z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
                <path d="M10 3l1-1 1 1-1 1-1-1z" fill="currentColor"/>
              </svg>
              AI Feedback
            </button>
          )}
        </nav>

        {/* User */}
        <div className="px-3 pb-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1"
            style={{ background: 'var(--surface)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: 'var(--surface-3)', color: 'var(--cyan)' }}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate" style={{ color: 'var(--text-1)', fontSize: 12 }}>
                {profile?.displayName ?? 'User'}
              </div>
              <div className="text-xs capitalize" style={{ color: 'var(--text-3)', fontSize: 11 }}>
                {profile?.role}
              </div>
            </div>
          </div>
          <button onClick={logout}
            className="nav-item"
            style={{ color: 'var(--text-3)', fontSize: 12 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M5 1H2a1 1 0 00-1 1v9a1 1 0 001 1h3M9 9.5l3-3-3-3M12 6.5H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onSuccess={() => setShowUpload(false)} />
      )}

      {/* ── Main ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">

        {/* Top bar */}
        <div className="sticky top-0 z-10 px-7 py-4 flex items-center justify-between"
          style={{
            background: 'rgba(9,9,10,0.88)',
            backdropFilter: 'blur(14px)',
            borderBottom: '1px solid var(--border)',
          }}>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Match Queue</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {pending.length} match{pending.length !== 1 ? 'es' : ''} available for review
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowUpload(true)} className="btn-cyan px-4 py-2.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 9V3M3.5 5.5L6 3l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 9.5v.5a1 1 0 001 1h8a1 1 0 001-1v-.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              Upload match
            </button>
            <div className="flex items-center gap-2 text-xs mono px-3 py-2 rounded-lg"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12 }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--green)' }} />
              Live
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-7 py-7 max-w-3xl">
          {pending.length === 0 && taken.length === 0 ? (

            /* Empty state */
            <div className="flex flex-col items-center justify-center py-28 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)' }}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <circle cx="11" cy="11" r="7.5" stroke="var(--text-3)" strokeWidth="1.5"/>
                  <line x1="3" y1="3" x2="6.7" y2="6.7" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="14.3" y1="14.3" x2="23" y2="23" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Queue is empty</p>
              <p className="text-sm mb-6" style={{ color: 'var(--text-3)', maxWidth: 280, lineHeight: 1.6 }}>
                Upload a padel match video to start detecting points
              </p>
              <button onClick={() => setShowUpload(true)} className="btn-cyan px-5 py-2.5">
                Upload first match →
              </button>
            </div>

          ) : (
            <div className="space-y-3">

              {/* Available matches */}
              {pending.map((match, i) => (
                <div key={match.id} style={{ animationDelay: `${i * 45}ms` }}>
                  <MatchCard
                    match={match}
                    onClaim={() => claimAndReview(match.id)}
                    onView={() => navigate(`/match/${match.id}`)}
                    claiming={claiming === match.id}
                    isMine={(match as any).claimedBy === profile?.uid}
                    isTaken={false}
                  />
                </div>
              ))}

              {/* Taken by others */}
              {taken.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-3 pb-1">
                    <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-3)', fontSize: 11 }}>
                      Being reviewed by others
                    </span>
                    <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                  </div>
                  {taken.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onClaim={() => {}}
                      onView={() => navigate(`/match/${match.id}`)}
                      claiming={false}
                      isMine={false}
                      isTaken
                    />
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
