import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface Stats {
  summary: { total: number; approved: number; rejected: number; corrected: number; approvalRate: number };
  signalAccuracy: Record<string, number | null>;
  weeklyTrend: { week: string; approvalRate: number; total: number }[];
  corrections: { count: number; avgStartDelta: number; avgEndDelta: number };
  readyToRecalibrate: boolean;
  minReviews: number;
}

interface WeightsData {
  weights: Record<string, number>;
  isDefault: boolean;
  isManualOverride?: boolean;
  reviewCount?: number;
  lastRecalibratedAt?: any;
}

const SIGNAL_LABELS: Record<string, string> = {
  sceneChange:    'Scene Change',
  motionAnalysis: 'Motion',
  audioAnalysis:  'Audio',
  visionAnalysis: 'Claude Vision',
};

const SIGNAL_COLORS: Record<string, string> = {
  sceneChange:    '#7C83FD',
  motionAnalysis: '#00B8CC',
  audioAnalysis:  '#00C853',
  visionAnalysis: '#FFB300',
};

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 11 }}>
        {label}
      </p>
      <p className="text-3xl font-bold mono tracking-tight" style={{ color: color ?? 'var(--text-1)', lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>{sub}</p>}
    </div>
  );
}

function MiniBarChart({ data }: { data: { week: string; approvalRate: number; total: number }[] }) {
  if (!data.length) return (
    <div className="h-24 flex items-center justify-center">
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>No data yet</p>
    </div>
  );

  const weeks = data.slice(-12);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {weeks.map(d => {
        const h = Math.max(4, Math.round((d.approvalRate / 100) * 72));
        const isHigh = d.approvalRate >= 70;
        return (
          <div key={d.week} className="flex-1 flex flex-col items-center gap-1.5 group relative">
            <div className="w-full rounded-md transition-all duration-500 cursor-default"
              style={{
                height: h,
                background: isHigh ? 'var(--cyan)' : d.approvalRate >= 50 ? 'var(--amber)' : 'var(--red)',
                opacity: 0.75,
              }}
            />
            <span className="mono" style={{ color: 'var(--text-3)', fontSize: 9 }}>
              {d.week.slice(5)}
            </span>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
              <div className="px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap shadow-lg"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-1)' }}>
                <span className="font-semibold">{d.approvalRate}%</span>
                <span style={{ color: 'var(--text-3)' }}> · {d.total} reviews</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function FeedbackDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats | null>(null);
  const [weightsData, setWeightsData] = useState<WeightsData | null>(null);
  const [draftWeights, setDraftWeights] = useState<Record<string, number>>({});
  const [recalibrating, setRecalibrating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    const [statsRes, weightsRes] = await Promise.all([
      fetch('/api/feedback/stats'),
      fetch('/api/feedback/weights'),
    ]);
    if (statsRes.ok) setStats(await statsRes.json());
    if (weightsRes.ok) {
      const wd = await weightsRes.json();
      setWeightsData(wd);
      setDraftWeights(wd.weights);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recalibrate = async () => {
    setRecalibrating(true);
    try {
      const res = await fetch('/api/feedback/recalibrate', { method: 'POST' });
      const data = await res.json();
      res.ok ? showToast(`Recalibrated — ${data.reviewCount} reviews`, 'success') : showToast(data.error, 'error');
      if (res.ok) await load();
    } finally {
      setRecalibrating(false);
    }
  };

  const saveOverride = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/feedback/weights/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: draftWeights }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Weights saved', 'success');
        setWeightsData(prev => prev ? { ...prev, weights: data.weights, isManualOverride: true } : prev);
        setDraftWeights(data.weights);
      } else {
        showToast(data.error, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const weightsChanged = weightsData
    ? Object.keys(draftWeights).some(k => Math.abs(draftWeights[k] - weightsData.weights[k]) > 0.001)
    : false;

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex" style={{ background: 'var(--bg)' }}>

      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col border-r"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>

        <div className="px-5 pt-6 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--cyan-bg)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                <circle cx="11" cy="11" r="8" stroke="var(--cyan)" strokeWidth="2.2"/>
                <line x1="3.5" y1="3.5" x2="8" y2="8" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="14" x2="24" y2="24" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>Bandeja</div>
              <div style={{ color: 'var(--text-3)', fontSize: 10 }}>Review Console</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <button onClick={() => navigate('/')} className="nav-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.65"/>
              <rect x="7.5" y="1" width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
              <rect x="1" y="7.5" width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
              <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.65"/>
            </svg>
            Match Queue
          </button>
          <button className="nav-item active" style={{ cursor: 'default' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 10V13h3l7-7-3-3-7 7z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
              <path d="M10 3l1-1 1 1-1 1-1-1z" fill="currentColor"/>
            </svg>
            AI Feedback
          </button>
        </nav>

        <div className="px-3 pb-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="px-2 py-1.5 rounded-lg" style={{ background: 'var(--surface)' }}>
            <span className="text-xs capitalize" style={{ color: 'var(--text-3)', fontSize: 11 }}>
              {profile?.displayName} · {profile?.role}
            </span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 px-7 py-4 flex items-center justify-between"
          style={{ background: 'rgba(6,9,14,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>AI Feedback Loop</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Detection accuracy · Signal weights · Recalibration
            </p>
          </div>
          {toast && (
            <div className="fade-in px-3 py-2 rounded-lg text-xs font-medium"
              style={{
                background: toast.type === 'success' ? 'var(--green-bg)' : 'var(--red-bg)',
                border: `1px solid ${toast.type === 'success' ? 'rgba(0,200,83,0.25)' : 'rgba(255,61,87,0.25)'}`,
                color: toast.type === 'success' ? 'var(--green)' : 'var(--red)',
              }}>
              {toast.text}
            </div>
          )}
        </div>

        <div className="px-7 py-7 space-y-5 max-w-4xl">

          {/* Summary stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total reviews" value={stats.summary.total} />
              <StatCard label="Approval rate" value={`${stats.summary.approvalRate}%`}
                color={stats.summary.approvalRate >= 70 ? 'var(--green)' : stats.summary.approvalRate >= 50 ? 'var(--amber)' : 'var(--red)'} />
              <StatCard label="Corrected" value={stats.summary.corrected}
                sub={`avg ${stats.corrections.avgStartDelta}s start · ${stats.corrections.avgEndDelta}s end`} />
              <StatCard label="Rejected" value={stats.summary.rejected}
                color={stats.summary.rejected > stats.summary.approved / 2 ? 'var(--red)' : undefined} />
            </div>
          )}

          {/* Chart + Signal accuracy — side by side */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Weekly trend */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Weekly approval rate</h2>
              {stats
                ? <MiniBarChart data={stats.weeklyTrend} />
                : <div className="h-24 flex items-center justify-center">
                    <div className="spinner" style={{ color: 'var(--text-3)' }} />
                  </div>
              }
            </div>

            {/* Signal accuracy */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Per-signal accuracy</h2>
              {stats
                ? (
                  <div className="space-y-3.5">
                    {Object.entries(stats.signalAccuracy).map(([key, val]) => (
                      <div key={key}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{SIGNAL_LABELS[key] ?? key}</span>
                          <span className="text-xs mono font-semibold" style={{
                            color: val === null ? 'var(--text-3)' : val >= 70 ? 'var(--green)' : val >= 50 ? 'var(--amber)' : 'var(--red)',
                          }}>
                            {val === null ? '—' : `${val}%`}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${val ?? 0}%`, background: SIGNAL_COLORS[key] ?? 'var(--cyan)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )
                : <div className="flex items-center justify-center h-24"><div className="spinner" style={{ color: 'var(--text-3)' }} /></div>
              }
            </div>
          </div>

          {/* Detection weights */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Detection weights</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  Drag to override. Auto-recalibrate updates these from review history.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {weightsData?.isManualOverride && (
                  <span className="badge badge-processing">Manual override</span>
                )}
                {weightsData?.isDefault && (
                  <span className="badge badge-uploaded">Default</span>
                )}
              </div>
            </div>

            <div className="space-y-4 mt-5">
              {Object.entries(draftWeights).map(([key, val]) => (
                <div key={key}>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>{SIGNAL_LABELS[key] ?? key}</span>
                    <span className="text-sm mono font-bold" style={{ color: SIGNAL_COLORS[key] ?? 'var(--cyan)' }}>
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={val}
                    style={{ accentColor: SIGNAL_COLORS[key] }}
                    onChange={e => setDraftWeights(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  />
                </div>
              ))}
            </div>

            {weightsChanged && (
              <div className="flex items-center justify-between mt-5 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
                <button onClick={() => setDraftWeights(weightsData?.weights ?? {})} className="btn-ghost px-4 py-2">
                  Reset
                </button>
                <button onClick={saveOverride} disabled={saving} className="btn-cyan px-5 py-2">
                  {saving ? <><div className="spinner" /> Saving…</> : 'Save override'}
                </button>
              </div>
            )}
          </div>

          {/* Recalibrate */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Auto-recalibrate</h2>
            <p className="text-xs mt-1 mb-5" style={{ color: 'var(--text-3)', lineHeight: 1.7 }}>
              Analyzes all review decisions and computes optimal signal weights automatically.
              Requires a minimum of {stats?.minReviews ?? 25} reviewed matches.
            </p>

            {stats && !stats.readyToRecalibrate && (
              <div className="mb-5 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between text-xs mb-2.5">
                  <span style={{ color: 'var(--text-2)' }}>Review progress</span>
                  <span className="mono font-semibold" style={{ color: 'var(--text-1)' }}>
                    {stats.summary.total} / {stats.minReviews}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (stats.summary.total / stats.minReviews) * 100)}%`,
                      background: 'var(--cyan)',
                    }} />
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                  {stats.minReviews - stats.summary.total} more reviews needed to unlock
                </p>
              </div>
            )}

            <button
              onClick={recalibrate}
              disabled={recalibrating || !stats?.readyToRecalibrate}
              className="btn-cyan px-5 py-2.5"
            >
              {recalibrating ? (
                <><div className="spinner" /> Recalibrating…</>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M11 6.5A4.5 4.5 0 112 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M11 3.5v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Recalibrate now
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
