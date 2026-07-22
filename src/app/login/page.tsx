'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'signup' ? { name, email, password } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
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

        {/* Mode toggle */}
        <div className="mb-6 grid grid-cols-2 rounded-xl border border-edge bg-wash/[0.03] p-1">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-lg py-2 text-sm font-medium transition ${
                mode === m
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

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
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input-dark"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="font-medium text-violet-300 hover:underline"
          >
            {mode === 'login' ? 'Create an account' : 'Sign in instead'}
          </button>
        </p>
      </div>
    </div>
  );
}
