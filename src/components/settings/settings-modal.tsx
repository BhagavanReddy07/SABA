'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, LogOut, X } from 'lucide-react';
import type { User } from '@/lib/types';
import type { ThemeMode } from '@/lib/use-theme';
import { ThemeModeSlider } from './theme-slider';

type Props = {
  open: boolean;
  onClose: () => void;
  user: User;
  onUserUpdate: (user: User) => void;
  onLogout: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
};

/** Anchored popover (like Claude's account menu) — render inside a `relative` wrapper near its trigger. */
export function SettingsModal({
  open,
  onClose,
  user,
  onUserUpdate,
  onLogout,
  themeMode,
  onThemeChange,
}: Props) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setName(user.name);
  }, [open, user.name]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== user.name;

  const saveName = async () => {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not save your name');
        return;
      }
      onUserUpdate(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not reach the server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className="animate-fade-up absolute bottom-full left-0 z-50 mb-2 w-[320px] rounded-2xl border border-edge bg-surface p-5 shadow-2xl"
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-base font-bold">Settings</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-wash/[0.06] hover:text-slate-200"
          aria-label="Close settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Profile */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Profile
        </h3>
        <label htmlFor="settings-name" className="mb-1.5 block text-xs font-medium text-slate-400">
          Name
        </label>
        <div className="flex gap-2">
          <input
            id="settings-name"
            className="input-dark"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            maxLength={80}
          />
          <button onClick={saveName} disabled={!dirty || saving} className="btn-primary !px-4 !py-0">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              'Save'
            )}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
          <p className="input-dark !cursor-not-allowed text-slate-500">{user.email}</p>
        </div>
      </section>

      {/* Appearance */}
      <section className="mt-5 border-t border-edge pt-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Appearance
        </h3>
        <div className="flex justify-center">
          <ThemeModeSlider mode={themeMode} onChange={onThemeChange} />
        </div>
      </section>

      {/* Account */}
      <div className="mt-5 border-t border-edge pt-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-slate-400 transition hover:bg-wash/[0.06] hover:text-red-300"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  );
}
