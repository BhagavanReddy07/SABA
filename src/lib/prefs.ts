'use client';

import { useCallback, useEffect, useState } from 'react';

/** Speech recognition / read-aloud languages offered in Settings (BCP-47). */
export const VOICE_LANGS: { code: string; label: string }[] = [
  { code: '', label: 'Browser default' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'हिन्दी — Hindi' },
  { code: 'te-IN', label: 'తెలుగు — Telugu' },
  { code: 'ta-IN', label: 'தமிழ் — Tamil' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ — Kannada' },
  { code: 'ml-IN', label: 'മലയാളം — Malayalam' },
  { code: 'mr-IN', label: 'मराठी — Marathi' },
  { code: 'bn-IN', label: 'বাংলা — Bengali' },
  { code: 'gu-IN', label: 'ગુજરાતી — Gujarati' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'ja-JP', label: '日本語' },
];

const KEY = 'saba-voice-lang';

/** Per-device voice language (localStorage). Returns [stored choice, effective BCP-47 tag, setter]. */
export function useVoiceLang(): [string, string, (lang: string) => void] {
  const [lang, setLang] = useState('');
  const [fallback, setFallback] = useState('en-US');

  useEffect(() => {
    setFallback(navigator.language || 'en-US');
    try {
      setLang(localStorage.getItem(KEY) ?? '');
    } catch {
      // storage blocked — keep the browser default
    }
  }, []);

  const update = useCallback((next: string) => {
    setLang(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // per-device convenience only
    }
  }, []);

  return [lang, lang || fallback, update];
}
