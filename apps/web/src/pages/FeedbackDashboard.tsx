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
    <div className="card p-4">
      <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>{label}</p>
      <p className="text-2xl font-bold mono" style={{ color: color ?? 'var(--text-1)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{sub}</p>}
    </div>
  );
}

function MiniBarChart({ data }: { data: { week: string; approvalRate: number; total: number }[] }) {
  if (!data.length) return <p className="text-xs" style={{ color: 'var(--text-3)' }}>No data yet</p>;
  const max = 100;
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.slice(-12).map(d => (
        <div key={d.week} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div className="w-full rounded-sm transition-all duration-500"
            style={{ height: `${(d.approvalRate / max) * 64}px`, background: 'var(--cyan)', opacity: 0.7 }} />
          <span className="text-xs mono" style={{ color: 'var(--text-3)', fontSize: 9 }}>
            {d.week.slice(5)}
          </span>
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
            <div className="px-2 py-1 rounded text-xs whitespace-nowrap"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-1)' }}>
              {d.approvalRate}% · {d.total} reviews
            </div>
          </div>
        </div>
      ))}
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
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
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
      if (res.ok) {
        showMessage(`Recalibrated with ${data.reviewCount} reviews`, 'success');
        await load();
      } else {
        showMessage(data.error, 'error');
      }
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
        showMessage('Weights saved', 'success');
        setWeightsData(prev => prev ? { ...prev, weights: data.weights, isManualOverride: true } : prev);
        setDraftWeights(data.weights);
      } else {
        showMessage(data.error, 'error');
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
      <aside className="w-56 shrink-0 flex flex-col border-r" style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
        <div className="px-5 py-5 flex items-center gap-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <circle cx="11" cy="11" r="8" stroke="var(--cyan)" strokeWidth="2"/>
            <line x1="3.5" y1="3.5" x2="8" y2="8" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round"/>
            <line x1="14" y1="14" x2="24" y2="24" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>Bandeja</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <button onClick={() => navigate('/')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
              <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/>
              <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/>
              <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.7"/>
            </svg>
            Queue
          </button>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface)', color: 'var(--cyan)', border: '1px solid rgba(0,229,255,0.15)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 10V13h3l7-7-3-3-7 7z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
              <path d="M10 3l1-1 1 1-1 1-1-1z" fill="currentColor"/>
            </svg>
            AI Feedback
          </div>
        </nav>
        <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xs capitalize px-2 py-1 rounded" style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>
            {profile?.role}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="sticky top-0 z-10 px-8 py-4 border-b flex items-center justify-between"
          style={{ background: 'rgba(8,11,15,0.85)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>AI Feedback Loop</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Detection accuracy · Signal weights · Recalibration
            </p>
          </div>
          {message && (
            <div className="px-3 py-2 rounded-lg text-xs font-medium"
              style={{
                background: message.type === 'success' ? 'rgba(0,200,83,0.1)' : 'rgba(255,61,87,0.1)',
                border: `1px solid ${message.type === 'success' ? 'rgba(0,200,83,0.3)' : 'rgba(255,61,87,0.3)'}`,
                color: message.type === 'success' ? 'var(--green)' : 'var(--red)',
              }}>
              {message.text}
            </div>
          )}
        </div>

        <div className="px-8 py-6 space-y-6 max-w-4xl">

          {/* Summary stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total reviews" value={stats.summary.total} />
              <StatCard label="Approval rate" value={`${stats.summary.approvalRate}%`}
                color={stats.summary.approvalRate >= 70 ? 'var(--green)' : stats.summary.approvalRate >= 50 ? 'var(--amber)' : 'var(--red)'} />
              <StatCard label="Corrected" value={stats.summary.corrected}
                sub={`avg ${stats.corrections.avgStartDelta}s start · ${stats.corrections.avgEndDelta}s end shift`} />
              <StatCard label="Rejected" value={stats.summary.rejected}
                color={stats.summary.rejected > stats.summary.approved / 2 ? 'var(--red)' : undefined} />
            </div>
          )}

          {/* Approval rate trend */}
          {stats && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Weekly approval rate</h2>
              <MiniBarChart data={stats.weeklyTrend} />
            </div>
          )}

          {/* Signal accuracy */}
          {stats && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Per-signal accuracy</h2>
              <div className="space-y-3">
                {Object.entries(stats.signalAccuracy).map(([key, val]) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span style={{ color: 'var(--text-2)' }}>{SIGNAL_LABELS[key] ?? key}</span>
                      <span className="mono" style={{ color: val === null ? 'var(--text-3)' : val >= 70 ? 'var(--green)' : val >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                        {val === null ? 'No data' : `${val}%`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${val ?? 0}%`, background: SIGNAL_COLORS[key] ?? 'var(--cyan)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detection weights */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Detection weights</h2>
              {weightsData?.isManualOverride && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,179,0,0.1)', color: 'var(--amber)', border: '1px solid rgba(255,179,0,0.25)' }}>
                  Manual override
                </span>
              )}
              {weightsData?.isDefault && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  Default
                </span>
              )}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              Drag sliders to override. Auto-recalibrate updates these from your review history.
            </p>
            <div className="space-y-4">
              {Object.entries(draftWeights).map(([key, val]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-2">
                    <span style={{ color: 'var(--text-2)' }}>{SIGNAL_LABELS[key] ?? key}</span>
                    <span className="mono" style={{ color: SIGNAL_COLORS[key] ?? 'var(--cyan)' }}>
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={val}
                    onChange={e => setDraftWeights(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    style={{ accentColor: SIGNAL_COLORS[key] }}
                  />
                </div>
              ))}
            </div>
            {weightsChanged && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <button onClick={() => setDraftWeights(weightsData?.weights ?? {})}
                  className="btn-ghost px-3 py-1.5 text-xs">Reset</button>
                <button onClick={saveOverride} disabled={saving} className="btn-cyan px-4 py-1.5 text-xs disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save override'}
                </button>
              </div>
            )}
          </div>

          {/* Recalibrate */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Auto-recalibrate</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              Analyzes all review decisions and computes optimal signal weights automatically.
              Requires {stats?.minReviews ?? 25} reviewed matches minimum.
            </p>

            {stats && !stats.readyToRecalibrate && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span style={{ color: 'var(--text-3)' }}>Review progress</span>
                  <span className="mono" style={{ color: 'var(--text-2)' }}>
                    {stats.summary.total} / {stats.minReviews}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.summary.total / stats.minReviews) * 100)}%`, background: 'var(--cyan)' }} />
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                  {stats.minReviews - stats.summary.total} more reviews needed
                </p>
              </div>
            )}

            <button
              onClick={recalibrate}
              disabled={recalibrating || !stats?.readyToRecalibrate}
              className="btn-cyan px-5 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {recalibrating ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Recalibrating…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M11 6.5A4.5 4.5 0 112 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M11 3.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
