'use client';

import { useEffect } from 'react';

/** Registers the push service worker. Production only: a localhost registration lingers for every app on that port. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    // After load so the SW install doesn't compete with first paint; load may have fired before hydration.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
