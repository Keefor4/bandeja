import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Match } from '@bandeja/shared';

const STATUS_COLOR: Record<string, string> = {
  uploaded:   'bg-slate-500/20 text-slate-400',
  processing: 'bg-yellow-500/20 text-yellow-400',
  detected:   'bg-blue-500/20 text-blue-400',
  reviewing:  'bg-purple-500/20 text-purple-400',
  approved:   'bg-green-500/20 text-green-400',
  rendering:  'bg-orange-500/20 text-orange-400',
  complete:   'bg-emerald-500/20 text-emerald-400',
  error:      'bg-red-500/20 text-red-400',
};

export default function Dashboard() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<(Match & { id: string })[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    // Real-time listener: show detected matches not yet claimed by someone else
    // Admins see all; reviewers only see unclaimed or their own
    const q = query(
      collection(db, 'matches'),
      where('status', 'in', ['detected', 'reviewing']),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Match) }));
      if (profile?.role === 'admin') {
        setMatches(all);
      } else {
        // Reviewers see: unclaimed OR claimed by themselves
        setMatches(all.filter((m) =>
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

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <header className="border-b border-[#2e3347] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">Bandeja</span>
          <span className="text-xs bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 px-2 py-0.5 rounded-full">REVIEW</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{profile?.displayName}</span>
          <span className="text-xs bg-[#2e3347] text-slate-300 px-2 py-1 rounded capitalize">{profile?.role}</span>
          <button onClick={logout} className="text-xs text-slate-500 hover:text-white transition-colors">Sign out</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Match Queue</h1>
            <p className="text-sm text-slate-400 mt-0.5">{matches.length} match{matches.length !== 1 ? 'es' : ''} ready for review</p>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <div className="text-4xl mb-3">🎾</div>
            <p className="text-sm">No matches in the queue — check back later.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => {
              const claimed = (match as any).claimedBy && (match as any).claimedBy !== profile?.uid;
              const mine = (match as any).claimedBy === profile?.uid;
              const progress = match.pointsApproved && match.pointsDetected
                ? Math.round((match.pointsApproved / match.pointsDetected) * 100)
                : 0;

              return (
                <div
                  key={match.id}
                  className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-5 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-sm font-semibold text-white truncate">{match.title}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[match.status] ?? STATUS_COLOR.uploaded}`}>
                        {match.status}
                      </span>
                      {mine && <span className="text-xs bg-[#00e5ff]/10 text-[#00e5ff] px-2 py-0.5 rounded-full">In progress</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{match.pointsDetected} points detected</span>
                      {match.pointsApproved > 0 && <span>{match.pointsApproved} approved</span>}
                      {match.metadata?.resolution && <span>{match.metadata.resolution}</span>}
                    </div>
                    {progress > 0 && (
                      <div className="mt-2 h-1 bg-[#2e3347] rounded-full overflow-hidden w-48">
                        <div className="h-full bg-[#00e5ff] rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>

                  {claimed ? (
                    <span className="text-xs text-slate-500 whitespace-nowrap">Taken by another reviewer</span>
                  ) : (
                    <button
                      onClick={() => claimAndReview(match.id)}
                      disabled={claiming === match.id}
                      className="bg-[#00e5ff] text-[#0f1117] font-semibold text-sm px-4 py-2 rounded-lg hover:bg-[#00c4d9] transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {claiming === match.id ? 'Opening…' : mine ? 'Continue' : 'Review'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
