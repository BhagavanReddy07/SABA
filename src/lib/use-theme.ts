'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'saba-theme';

/**
 * Theme preference, persisted to localStorage and tracking OS changes while on
 * 'system'. Scoped, not global: put the returned `light` flag as a `light`
 * class on the subtree that should be themed (chat only — landing/login stay dark).
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') setModeState(stored);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(KEY, next);
    setModeState(next);
  }, []);

  const light = mode === 'system' ? !systemDark : mode === 'light';
  return { mode, setMode, light };
}
