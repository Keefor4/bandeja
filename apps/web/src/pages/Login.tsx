import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function RacketMark({ color = 'var(--cyan)' }: { color?: string }) {
  return (
    <svg width="16" height="19" viewBox="0 0 20 24" fill="none">
      <ellipse cx="10" cy="9" rx="8.2" ry="8.5" stroke={color} strokeWidth="1.6"/>
      <circle cx="7.5" cy="7.5" r="0.9" fill={color} fillOpacity="0.5"/>
      <circle cx="10" cy="7"   r="0.9" fill={color} fillOpacity="0.5"/>
      <circle cx="12.5" cy="7.5" r="0.9" fill={color} fillOpacity="0.5"/>
      <circle cx="7.5" cy="10.5" r="0.9" fill={color} fillOpacity="0.5"/>
      <circle cx="10" cy="11"  r="0.9" fill={color} fillOpacity="0.5"/>
      <circle cx="12.5" cy="10.5" r="0.9" fill={color} fillOpacity="0.5"/>
      <path d="M7 17.5h6"  stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M10 17.5V22" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export default function Login() {
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch {
      setError('Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex" style={{ background: 'var(--bg)' }}>

      {/* ── Left panel: Brand identity ─────────────────────── */}
      <div
        className="hidden lg:flex flex-col w-[420px] shrink-0 relative overflow-hidden"
        style={{ background: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}
      >
        {/* Faint grid — subtle court reference */}
        <div
          className="absolute inset-0 pointer-events-none select-none"
          aria-hidden="true"
          style={{
            backgroundImage: `
              linear-gradient(rgba(240,237,233,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(240,237,233,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '52px 52px',
          }}
        />

        <div className="relative flex flex-col h-full px-11 py-11">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--cyan-bg)', border: '1px solid rgba(184,255,64,0.2)' }}
            >
              <RacketMark />
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
              Bandeja
            </span>
          </div>

          {/* Hero copy */}
          <div className="flex-1 flex flex-col justify-center py-8">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 w-max"
              style={{ background: 'var(--cyan-bg)', border: '1px solid rgba(184,255,64,0.15)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--cyan)' }} />
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--cyan)', letterSpacing: '0.15em', fontSize: 10 }}
              >
                Review Console
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(36px, 3.4vw, 50px)',
                fontWeight: 800,
                lineHeight: 1.06,
                letterSpacing: '-0.035em',
                color: 'var(--text-1)',
              }}
            >
              Every great<br />
              point,<br />
              <span style={{ color: 'var(--text-3)' }}>precisely</span><br />
              cut.
            </h1>
          </div>

          {/* Footer */}
          <div className="pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.85 }}>
              AI-powered padel highlight detection.<br />
              Review · Tag · Generate.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel: Sign-in form ──────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[352px] fade-up">

          {/* Mobile-only logo */}
          <div className="flex items-center gap-2.5 mb-9 lg:hidden">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--cyan-bg)', border: '1px solid rgba(184,255,64,0.2)' }}
            >
              <RacketMark />
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
              Bandeja
            </span>
          </div>

          <h2
            className="text-2xl font-bold mb-2"
            style={{ color: 'var(--text-1)', letterSpacing: '-0.025em' }}
          >
            Sign in
          </h2>
          <p className="text-sm mb-8" style={{ color: 'var(--text-3)' }}>
            Continue to your review console
          </p>

          <div className="space-y-4">

            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-2)',
                color: 'var(--text-1)',
                cursor: 'pointer',
                transition: 'background 150ms ease, border-color 150ms ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--surface-2)';
                e.currentTarget.style.borderColor = 'var(--border-3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--surface)';
                e.currentTarget.style.borderColor = 'var(--border-2)';
              }}
            >
              {googleLoading ? (
                <div className="spinner" style={{ color: 'var(--text-2)' }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {googleLoading ? 'Signing in…' : 'Continue with Google'}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>or email</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            <form onSubmit={handleEmail} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="field-input"
                />
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'var(--red-bg)',
                    border: '1px solid rgba(248,113,113,0.22)',
                    color: 'var(--red)',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                    <path d="M6.5 1a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm0 8.25a.75.75 0 110-1.5.75.75 0 010 1.5zm.5-3.25h-1V4h1v2z"/>
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-cyan w-full py-2.5 mt-1">
                {loading ? <><div className="spinner" /> Signing in…</> : 'Sign in →'}
              </button>
            </form>
          </div>

          <p className="text-center mt-8" style={{ color: 'var(--text-3)', fontSize: 11 }}>
            Bandeja AI · Padel Match Review
          </p>
        </div>
      </div>
    </div>
  );
}
