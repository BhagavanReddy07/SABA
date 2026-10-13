'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';
import type { PublicConfig } from '@/lib/types';

function GoogleLogo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.55-.2-2.28H12v4.51h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.85z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.9l-3.87-3a7.24 7.24 0 0 1-10.8-3.8H1.27v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.26 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.27a12 12 0 0 0 0 10.8l3.99-3.1z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.97 11.97 0 0 0 1.27 6.6l3.99 3.1A7.24 7.24 0 0 1 12 4.75z" />
    </svg>
  );
}

type Mode = 'login' | 'signup' | 'forgot';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then(setConfig)
      .catch(() => {});
    // The Google callback lands back here with ?error=… when sign-in fails.
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) {
      setError(err === 'google-unconfigured' ? 'Google sign-in isn’t set up on this server.' : 'Google sign-in failed. Please try again.');
      window.history.replaceState(null, '', '/login');
    }
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'signup' ? { name, email, password } : mode === 'login' ? { email, password } : { email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }
      if (mode === 'forgot') {
        setNotice('If that email has a SABA account, a reset link is on its way. It works for 1 hour.');
        return;
      }
      router.push('/chat');
    } catch {
      setError('Could not reach the server. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="aurora" />
      <div className="grid-floor" aria-hidden />

      <div className="animate-fade-up glass-deep relative z-10 w-full max-w-md rounded-3xl p-8">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-display text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-violet-400" />
          <span className="text-gradient">SABA</span>
        </Link>

        {mode === 'forgot' ? (
          <div className="mb-6 text-center">
            <h1 className="font-display text-lg font-semibold text-slate-100">Reset your password</h1>
            <p className="mt-1 text-xs text-slate-500">We&apos;ll email you a one-time link.</p>
          </div>
        ) : (
          <div className="mb-6 grid grid-cols-2 rounded-xl border border-edge bg-wash/[0.03] p-1" role="tablist">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`rounded-lg py-2 text-sm font-medium transition ${
                  mode === m ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-slate-400">
                Name
              </label>
              <input
                id="name"
                className="input-dark"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should SABA call you?"
                maxLength={80}
                autoComplete="name"
                required
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input-dark"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          {mode !== 'forgot' && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-slate-400">
                  Password
                </label>
                {mode === 'login' && config?.email && (
                  <button type="button" onClick={() => switchMode('forgot')} className="text-[11px] text-violet-300 hover:underline">
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="password"
                type="password"
                className="input-dark"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
              {notice}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        {config?.google && mode !== 'forgot' && (
          <>
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-600">
              <span className="h-px flex-1 bg-edge" />
              or
              <span className="h-px flex-1 bg-edge" />
            </div>
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-edge bg-wash/[0.04] py-2.5 text-sm font-medium text-slate-200 transition hover:bg-wash/[0.08]"
            >
              <GoogleLogo />
              Continue with Google
            </a>
          </>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          {mode === 'forgot' ? (
            <button type="button" onClick={() => switchMode('login')} className="font-medium text-violet-300 hover:underline">
              Back to sign in
            </button>
          ) : (
            <>
              {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                className="font-medium text-violet-300 hover:underline"
              >
                {mode === 'login' ? 'Create an account' : 'Sign in instead'}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
