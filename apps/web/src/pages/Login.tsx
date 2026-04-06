import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--bg)' }}>

      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `
          linear-gradient(rgba(0,229,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,229,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '52px 52px',
      }} />

      {/* Top glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center top, rgba(0,229,255,0.08) 0%, transparent 65%)' }} />

      {/* Card */}
      <div className="relative w-full max-w-[384px] mx-4 fade-up">

        {/* Logo lockup */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-2)',
                boxShadow: '0 0 28px rgba(0,229,255,0.12)',
              }}>
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                <circle cx="11" cy="11" r="8" stroke="var(--cyan)" strokeWidth="2.2"/>
                <line x1="3.5" y1="3.5" x2="8" y2="8" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="14" x2="24" y2="24" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="7" y1="11" x2="15" y2="11" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45"/>
                <line x1="11" y1="7" x2="11" y2="15" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>Bandeja</h1>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--cyan)' }} />
                <span className="text-xs tracking-widest uppercase font-medium" style={{ color: 'var(--text-3)', fontSize: 10 }}>
                  Review Console
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form card */}
        <div className="card p-6 space-y-4" style={{ boxShadow: 'var(--shadow-xl)' }}>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              color: 'var(--text-1)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--surface-3)';
              e.currentTarget.style.borderColor = 'var(--border-3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--surface-2)';
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
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Email</label>
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
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Password</label>
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
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,61,87,0.22)', color: 'var(--red)' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                  <path d="M6.5 1a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm0 8.25a.75.75 0 110-1.5.75.75 0 010 1.5zm.5-3.25h-1V4h1v2z"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-cyan w-full py-2.5 mt-1">
              {loading ? <><div className="spinner" /> Signing in…</> : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center mt-5" style={{ color: 'var(--text-3)', fontSize: 11 }}>
          Bandeja AI · Padel Match Review System
        </p>
      </div>
    </div>
  );
}
