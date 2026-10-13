'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, Sparkles } from 'lucide-react';

/** Landing page for the password-reset email link (/reset?token=…). */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The passwords don’t match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }
      router.replace('/chat');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="aurora" />
      <div className="animate-fade-up glass-deep relative z-10 w-full max-w-md rounded-3xl p-8">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-display text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-violet-400" />
          <span className="text-gradient">SABA</span>
        </Link>
        <h1 className="flex items-center justify-center gap-2 font-display text-lg font-semibold text-slate-100">
          <KeyRound className="h-4 w-4 text-violet-300" /> Choose a new password
        </h1>
        <p className="mb-6 mt-1 text-center text-xs text-slate-500">This signs you out everywhere else.</p>

        {!token ? (
          <p className="text-center text-sm text-slate-400">
            This page needs the link from your reset email.{' '}
            <Link href="/login" className="text-violet-300 hover:underline">
              Request a new one
            </Link>
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-400">
                New password
              </label>
              <input
                id="password"
                type="password"
                className="input-dark"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-xs font-medium text-slate-400">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                className="input-dark"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save and sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
