'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'saba-theme';

function apply(mode: ThemeMode) {
  const isDark =
    mode === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode === 'dark';
  document.documentElement.classList.toggle('light', !isDark);
}

/** Persists to localStorage, applies to <html>, and tracks OS changes while on 'system'. */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') setModeState(stored);
  }, []);

  useEffect(() => {
    apply(mode);
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(KEY, next);
    setModeState(next);
  }, []);

  return { mode, setMode };
}
