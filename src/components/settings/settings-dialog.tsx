'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  Mic,
  Palette,
  Plug,
  Send,
  Shield,
  Sunrise,
  Trash2,
  UserIcon,
  X,
} from 'lucide-react';
import type { AccessToken, PublicConfig, User } from '@/lib/types';
import type { ThemeMode } from '@/lib/use-theme';
import { VOICE_LANGS } from '@/lib/prefs';
import { ThemeModeSlider } from './theme-slider';

export type SettingsTab = 'profile' | 'notifications' | 'connections' | 'voice' | 'privacy' | 'appearance';

type Props = {
  open: boolean;
  onClose: () => void;
  user: User;
  onUserUpdate: (user: User) => void;
  /** null while loading — every optional service counts as unavailable until it arrives. */
  config: PublicConfig | null;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  /** '' = browser default. */
  voiceLang: string;
  onVoiceLangChange: (lang: string) => void;
  memoryCount: number;
  /** Closes settings and opens the Memory dialog. */
  onOpenMemory: () => void;
  onLogout: () => void;
  initialTab?: SettingsTab;
};

const TABS: { key: SettingsTab; label: string; icon: typeof Bell }[] = [
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'connections', label: 'Connections', icon: Plug },
  { key: 'voice', label: 'Voice & language', icon: Mic },
  { key: 'privacy', label: 'Privacy & data', icon: Shield },
  { key: 'appearance', label: 'Appearance', icon: Palette },
];

const DANGER_BTN =
  'inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:pointer-events-none disabled:opacity-40';

/** fetch + JSON that throws a message fit to show inline: the route's `{ error }`, or a 429/offline fallback. */
async function api<T = unknown>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error('Could not reach the server — check your connection.');
  });
  if (res.status === 429) throw new Error('Too many attempts — try again later.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong — try again.');
  return data as T;
}

type Status = { ok: boolean; text: string } | null;

/** One button's request: a pending flag plus its inline result. `fn` returns the success message, if any. */
function useAction() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setPending(true);
    setStatus(null);
    try {
      const text = await fn();
      if (text) setStatus({ ok: true, text });
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message || 'Something went wrong — try again.' });
    } finally {
      setPending(false);
    }
  };
  return { pending, status, run };
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday", "12 days ago". */
function ago(iso: string): string {
  const secs = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of [['day', 86_400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(secs) >= size) return relative.format(Math.round(secs / size), unit);
  }
  return 'just now';
}

/** VAPID public key (base64url) → the raw bytes PushManager.subscribe expects. */
function urlBase64ToUint8Array(base64: string) {
  const b64 = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Centered, tabbed settings. Renders nothing while closed; every field and message resets on each open. */
export function SettingsDialog(props: Props) {
  return props.open ? <Dialog {...props} /> : null;
}

function Dialog({
  onClose,
  user,
  onUserUpdate,
  config,
  themeMode,
  onThemeChange,
  voiceLang,
  onVoiceLangChange,
  memoryCount,
  onOpenMemory,
  onLogout,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'profile');
  const closeRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus the selected tab on open; hand focus back to whatever opened the dialog on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('#settings-tabs [aria-selected="true"]')?.focus();
    return () => opener?.focus();
  }, []);

  // Panels share one scroller — start each tab at the top.
  // Block body on purpose: newer Chromium's scrollTo() returns a Promise, and React would call it as a cleanup.
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
  }, [tab]);

  // Arrows on both axes (a vertical list from sm: up, a scrolling row on phones), plus Home / End.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === tab);
    const moves: Record<string, number | undefined> = {
      ArrowDown: i + 1,
      ArrowRight: i + 1,
      ArrowUp: i - 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    const to = moves[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = TABS[(to + TABS.length) % TABS.length].key;
    setTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  };

  // aria-modal: Tab wraps between the first (close) and last (Log out) controls instead of leaving the dialog.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const [edge, wrapTo] = e.shiftKey ? [closeRef, logoutRef] : [logoutRef, closeRef];
    if (document.activeElement !== edge.current) return;
    e.preventDefault();
    wrapTo.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onKeyDown={trapTab}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="animate-fade-up glass-deep relative flex h-[85dvh] max-h-[42rem] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface/95">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 id="settings-title" className="font-display text-base font-bold">
            Settings
          </h2>
          <button ref={closeRef} onClick={onClose} className="btn-icon" aria-label="Close settings">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div
            id="settings-tabs"
            role="tablist"
            aria-label="Settings sections"
            onKeyDown={onTabKey}
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-edge p-2 sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                id={`settings-tab-${key}`}
                role="tab"
                aria-selected={tab === key}
                aria-controls={`settings-panel-${key}`}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${
                  tab === key ? 'bg-wash/[0.08] text-slate-100' : 'text-slate-400 hover:bg-wash/[0.04] hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${tab === key ? 'text-violet-300' : ''}`} />
                {label}
              </button>
            ))}
          </div>

          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-5">
            <Panel id="profile" tab={tab}>
              <Profile
                user={user}
                onUserUpdate={onUserUpdate}
                config={config}
                memoryCount={memoryCount}
                onOpenMemory={onOpenMemory}
              />
            </Panel>
            <Panel id="notifications" tab={tab}>
              <Notifications user={user} onUserUpdate={onUserUpdate} config={config} />
            </Panel>
            <Panel id="connections" tab={tab}>
              <Connections user={user} onUserUpdate={onUserUpdate} config={config} active={tab === 'connections'} />
            </Panel>
            <Panel id="voice" tab={tab}>
              <div>
                <label htmlFor="settings-voice" className="mb-1.5 block text-xs font-medium text-slate-400">
                  Voice language
                </label>
                <select
                  id="settings-voice"
                  value={voiceLang}
                  onChange={(e) => onVoiceLangChange(e.target.value)}
                  className="input-dark"
                >
                  {VOICE_LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Used for voice input, Talk mode and read-aloud. You can talk to SABA in any language — memories are
                  stored in English, so what you say in one language is remembered in all of them.
                </p>
              </div>
            </Panel>
            <Panel id="privacy" tab={tab}>
              <Privacy user={user} onLogout={onLogout} />
            </Panel>
            <Panel id="appearance" tab={tab}>
              <div className="flex flex-col items-center gap-3 pt-2">
                <ThemeModeSlider mode={themeMode} onChange={onThemeChange} />
                <p className="text-xs text-slate-500">System follows your device&apos;s light or dark setting.</p>
              </div>
            </Panel>
          </div>
        </div>

        <div className="border-t border-edge p-2">
          <button
            ref={logoutRef}
            onClick={onLogout}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-wash/[0.06] hover:text-red-300"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}

function Profile({
  user,
  onUserUpdate,
  config,
  memoryCount,
  onOpenMemory,
}: Pick<Props, 'user' | 'onUserUpdate' | 'config' | 'memoryCount' | 'onOpenMemory'>) {
  const [name, setName] = useState(user.name);
  const save = useAction();
  const verify = useAction();
  const reset = useAction();
  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== user.name;

  const saveName = () =>
    save.run(async () => {
      const data = await api<{ user: User }>('/api/auth/me', 'PATCH', { name: trimmed });
      onUserUpdate(data.user);
      return 'Saved.';
    });

  const sendVerification = () =>
    verify.run(async () => {
      const data = await api<{ alreadyVerified?: boolean }>('/api/auth/verify', 'POST');
      if (!data.alreadyVerified) return 'Sent — check your inbox.';
      onUserUpdate({ ...user, emailVerified: true }); // verified elsewhere since this page loaded
    });

  const sendReset = () =>
    reset.run(async () => {
      await api('/api/auth/forgot', 'POST', { email: user.email });
      return 'Check your inbox for a reset link.';
    });

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveName();
        }}
      >
        <label htmlFor="settings-name" className="mb-1.5 block text-xs font-medium text-slate-400">
          Name
        </label>
        <div className="flex gap-2">
          <input
            id="settings-name"
            className="input-dark"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
          />
          <button type="submit" disabled={!dirty || save.pending} className="btn-primary !px-4 !py-0">
            {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </button>
        </div>
        <Note status={save.status} />
      </form>

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <label htmlFor="settings-email" className="text-xs font-medium text-slate-400">
            Email
          </label>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              user.emailVerified
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
            }`}
          >
            {user.emailVerified ? 'Verified' : 'Not verified'}
          </span>
        </div>
        <input id="settings-email" className="input-dark text-slate-400" value={user.email} readOnly />
        {!user.emailVerified && config?.email && (
          <>
            <button onClick={sendVerification} disabled={verify.pending} className="btn-ghost mt-2 !px-3 !py-1.5 text-xs">
              {verify.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send verification email
            </button>
            <Note status={verify.status} />
          </>
        )}
      </div>

      {config?.email && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">Password</p>
          {/* Google-only accounts add a password through the same emailed link. */}
          <button onClick={sendReset} disabled={reset.pending} className="btn-ghost !px-3 !py-1.5 text-xs">
            {reset.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {user.hasPassword ? 'Send password reset link' : 'Set a password'}
          </button>
          <Note status={reset.status} />
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-400">Memory</p>
        <button
          onClick={onOpenMemory}
          className="flex w-full items-center gap-3 rounded-xl border border-edge bg-wash/[0.03] px-3 py-2.5 text-left transition hover:bg-wash/[0.07]"
        >
          <Brain className="h-4 w-4 shrink-0 text-violet-300" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-slate-200">What SABA knows about you</span>
            <span className="block text-xs text-slate-500">
              {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </div>
    </>
  );
}

function Notifications({ user, onUserUpdate, config }: Pick<Props, 'user' | 'onUserUpdate' | 'config'>) {
  const brief = useAction();
  const push = useAction();
  // Push is per device, not per account: 'checking' until this browser says whether it's subscribed.
  const [pushState, setPushState] = useState<'checking' | 'unsupported' | 'off' | 'on'>('checking');
  const vapidKey = config?.push;

  useEffect(() => {
    if (!vapidKey) return;
    if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
      setPushState('unsupported');
      return;
    }
    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then(
        (sub) => setPushState(sub ? 'on' : 'off'),
        () => setPushState('off')
      );
  }, [vapidKey]);

  const toggleBrief = () =>
    brief.run(async () => {
      const data = await api<{ user: User }>('/api/auth/me', 'PATCH', { briefEnabled: !user.briefEnabled });
      onUserUpdate(data.user);
    });

  const enablePush = (key: string) =>
    push.run(async () => {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        throw new Error('Notifications are blocked — allow them for this site in your browser settings, then try again.');
      }
      if (permission !== 'granted') throw new Error("Notifications weren't allowed.");
      await navigator.serviceWorker.register('/sw.js');
      // ponytail: no timeout on `ready` — sw.js can't fail its install step; add one if it ever gains a waitUntil.
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      try {
        await api('/api/push', 'POST', sub.toJSON());
      } catch (err) {
        await sub.unsubscribe().catch(() => {}); // don't leave a subscription the server never saved
        throw err;
      }
      setPushState('on');
      return 'Notifications are on for this device.';
    });

  const disablePush = () =>
    push.run(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api('/api/push', 'DELETE', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setPushState('off');
      return 'Notifications are off for this device.';
    });

  // Only suggest channels this server actually has.
  const ways = [
    config?.email && 'verify your email',
    config?.telegram && 'connect Telegram',
    vapidKey && pushState !== 'unsupported' && 'turn on push below',
  ].filter(Boolean) as string[];
  const undeliverable =
    user.briefEnabled && !(user.emailVerified && config?.email) && !user.telegramLinked && pushState !== 'on';

  return (
    <>
      <div>
        <Row
          icon={Sunrise}
          title="Morning brief"
          desc="Around 8 AM your time: today's tasks, birthdays coming up, and a goal check-in."
        >
          <Switch label="Morning brief" checked={user.briefEnabled} disabled={brief.pending} onChange={toggleBrief} />
        </Row>
        <p aria-live="polite" className="text-xs text-amber-400">
          {undeliverable && (
            <span className="mt-2 block">
              {ways.length
                ? `Nowhere to send it yet — ${new Intl.ListFormat('en', { type: 'disjunction' }).format(ways)}.`
                : 'This server has no email, Telegram or push set up to deliver it.'}
            </span>
          )}
        </p>
        <Note status={brief.status} />
      </div>

      {vapidKey && (
        <div>
          <Row
            icon={BellRing}
            title="Push notifications"
            desc={
              pushState === 'unsupported'
                ? "This browser can't receive push notifications."
                : 'Reminders and your morning brief arrive as notifications on this device.'
            }
          >
            <Switch
              label="Push notifications"
              checked={pushState === 'on'}
              disabled={push.pending || pushState === 'checking' || pushState === 'unsupported'}
              onChange={() => (pushState === 'on' ? disablePush() : enablePush(vapidKey))}
            />
          </Row>
          <Note status={push.status} />
        </div>
      )}
    </>
  );
}

function Connections({
  user,
  onUserUpdate,
  config,
  active,
}: Pick<Props, 'user' | 'onUserUpdate' | 'config'> & { active: boolean }) {
  const telegram = useAction();
  const calendar = useAction();
  const create = useAction();
  const revoke = useAction();
  // Set while the user taps Start in Telegram — the bot links the chat server-side, so we poll.
  const [link, setLink] = useState<{ url: string; until: number; expired: boolean } | null>(null);
  const [tokens, setTokens] = useState<AccessToken[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [created, setCreated] = useState<{ id: string; token: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Every 3 s for up to 2 min; the cleanup also stops it on close / unmount.
  useEffect(() => {
    if (!link || link.expired || user.telegramLinked) return;
    const id = setInterval(async () => {
      if (Date.now() > link.until) {
        setLink({ ...link, expired: true });
        return;
      }
      const fresh = await api<{ user: User }>('/api/auth/me').then(
        (data) => data.user,
        () => null
      );
      if (fresh?.telegramLinked) {
        setLink(null);
        onUserUpdate(fresh);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [link, user.telegramLinked, onUserUpdate]);

  // Refresh the token list each time the tab opens.
  useEffect(() => {
    if (!active) return;
    api<{ tokens: AccessToken[] }>('/api/tokens').then(
      (data) => {
        setTokens(data.tokens);
        setLoadError(null);
      },
      (err: Error) => setLoadError(err.message)
    );
  }, [active]);

  const connectTelegram = () =>
    telegram.run(async () => {
      const { url } = await api<{ url: string }>('/api/telegram/link', 'POST');
      window.open(url, '_blank', 'noopener');
      setLink({ url, until: Date.now() + 120_000, expired: false });
    });

  const disconnectTelegram = () =>
    telegram.run(async () => {
      await api('/api/telegram/link', 'DELETE');
      setLink(null);
      onUserUpdate({ ...user, telegramLinked: false });
      return 'Telegram disconnected.';
    });

  const disconnectCalendar = () =>
    calendar.run(async () => {
      await api('/api/calendar', 'DELETE');
      onUserUpdate({ ...user, calendarLinked: false });
      return 'Google Calendar disconnected.';
    });

  const createToken = () =>
    create.run(async () => {
      const data = await api<{ token: string; record: AccessToken }>('/api/tokens', 'POST', { name: tokenName.trim() });
      setTokens((prev) => [data.record, ...(prev ?? [])]);
      setTokenName('');
      setCreated({ id: data.record.id, token: data.token });
    });

  const revokeToken = (id: string) =>
    revoke.run(async () => {
      await api(`/api/tokens/${id}`, 'DELETE');
      setTokens((prev) => prev && prev.filter((t) => t.id !== id));
      setCreated((c) => (c?.id === id ? null : c));
      return 'Token revoked.';
    });

  return (
    <>
      {config?.telegram && (
        <div>
          <Row
            icon={Send}
            title="Telegram"
            desc={
              user.telegramLinked ? (
                <span className="text-emerald-400">Connected</span>
              ) : (
                'Chat with SABA and get reminders in Telegram.'
              )
            }
          >
            {user.telegramLinked ? (
              <button onClick={disconnectTelegram} disabled={telegram.pending} className="btn-ghost !px-3 !py-1.5 text-xs">
                {telegram.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Disconnect
              </button>
            ) : (
              <button onClick={connectTelegram} disabled={telegram.pending} className="btn-primary !px-3 !py-1.5 text-xs">
                {telegram.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Connect Telegram
              </button>
            )}
          </Row>
          <p aria-live="polite" className="text-xs text-slate-400">
            {link && !user.telegramLinked && (
              <span className="mt-2 block">
                {link.expired ? (
                  'Not linked yet — tap Connect Telegram to try again.'
                ) : (
                  <>
                    Tap Start in Telegram — this updates automatically.{' '}
                    {/* Fallback for browsers that block the pop-up (it opens after an await). */}
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:text-violet-200">
                      Open Telegram
                    </a>
                  </>
                )}
              </span>
            )}
          </p>
          <Note status={telegram.status} />
        </div>
      )}

      {config?.calendar && (
        <div>
          <Row
            icon={CalendarDays}
            title="Google Calendar"
            desc={
              user.calendarLinked ? (
                <>
                  <span className="text-emerald-400">Connected</span> — SABA can read and add events
                </>
              ) : (
                'Let SABA check your schedule and add events.'
              )
            }
          >
            {user.calendarLinked ? (
              <button onClick={disconnectCalendar} disabled={calendar.pending} className="btn-ghost !px-3 !py-1.5 text-xs">
                {calendar.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => (window.location.href = '/api/auth/google?calendar=1')}
                className="btn-primary !px-3 !py-1.5 text-xs"
              >
                Connect Google Calendar
              </button>
            )}
          </Row>
          <Note status={calendar.status} />
        </div>
      )}

      <Section title="MCP access tokens">
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          Use your SABA memory from Claude Desktop, Cursor, VS Code and other MCP clients.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createToken();
          }}
          className="flex gap-2"
        >
          <label htmlFor="settings-token-name" className="sr-only">
            Token name
          </label>
          <input
            id="settings-token-name"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            maxLength={60}
            placeholder="Token name, e.g. Claude Desktop"
            className="input-dark !py-2 text-xs"
          />
          <button type="submit" disabled={!tokenName.trim() || create.pending} className="btn-primary shrink-0 !px-3 !py-2 text-xs">
            {create.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create
          </button>
        </form>
        <Note status={create.status} />

        {created && <TokenReveal token={created.token} />}

        {tokens === null ? (
          <p aria-live="polite" className={`mt-3 text-xs ${loadError ? 'text-red-400' : 'text-slate-600'}`}>
            {loadError ?? 'Loading tokens…'}
          </p>
        ) : tokens.length === 0 ? (
          <p className="mt-3 text-xs text-slate-600">No tokens yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tokens.map((t) => (
              <li key={t.id} className="glass flex items-center gap-3 rounded-xl p-3">
                <KeyRound className="h-4 w-4 shrink-0 text-violet-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-200">{t.name}</p>
                  <p className="text-[10px] text-slate-500">
                    <span className="font-mono">{t.prefix}…</span> · created {day(t.createdAt)} · last used{' '}
                    {t.lastUsedAt ? ago(t.lastUsedAt) : 'never'}
                  </p>
                </div>
                {confirmId === t.id ? (
                  <button
                    onClick={() => {
                      setConfirmId(null);
                      revokeToken(t.id);
                    }}
                    onBlur={() => setConfirmId(null)}
                    autoFocus
                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/10"
                  >
                    Revoke?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmId(t.id)}
                    disabled={revoke.pending}
                    className="btn-icon !p-1.5 hover:!bg-red-500/10 hover:!text-red-400"
                    aria-label={`Revoke ${t.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <Note status={revoke.status} />
      </Section>
    </>
  );
}

/** The new token, shown once, plus a ready-to-paste MCP client config. */
function TokenReveal({ token }: { token: string }) {
  const snippet = JSON.stringify(
    { mcpServers: { saba: { url: `${window.location.origin}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2
  );
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
      <p className="text-xs font-semibold text-amber-400">Copy it now — it won&apos;t be shown again</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-wash/[0.06] px-2 py-1.5 font-mono text-xs text-slate-100">
          {token}
        </code>
        <CopyButton text={token} label="Copy token" />
      </div>
      <p className="text-[11px] text-slate-400">Add it to your MCP client&apos;s config:</p>
      <div className="flex items-start gap-2">
        <pre className="min-w-0 flex-1 select-all overflow-x-auto rounded-lg bg-wash/[0.06] p-2 font-mono text-[11px] leading-relaxed text-slate-300">
          {snippet}
        </pre>
        <CopyButton text={snippet} label="Copy MCP config" />
      </div>
    </div>
  );
}

function Privacy({ user, onLogout }: Pick<Props, 'user' | 'onLogout'>) {
  const signOut = useAction();
  const remove = useAction();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [typed, setTyped] = useState('');
  const upkeep = user.lastConsolidation;

  const signOutEverywhere = () =>
    signOut.run(async () => {
      await api('/api/auth/sessions', 'DELETE');
      onLogout();
    });

  const deleteAccount = () =>
    remove.run(async () => {
      await api('/api/auth/me', 'DELETE', { confirm: typed });
      window.location.href = '/';
    });

  return (
    <>
      <Section title="Your data">
        <a href="/api/export" download className="btn-ghost !px-3 !py-1.5 text-xs">
          <Download className="h-3.5 w-3.5" /> Download my data
        </a>
        <p className="mt-2 text-xs text-slate-500">
          One JSON file with your profile, conversations, memories, tasks, documents and goals.
        </p>
      </Section>

      {upkeep && (
        <Section title="Memory upkeep">
          <p className="text-xs leading-relaxed text-slate-400">
            Last tidied {ago(upkeep.at)}: merged {upkeep.merged}, retired {upkeep.retired}, summarized{' '}
            {upkeep.summarized} {upkeep.summarized === 1 ? 'conversation' : 'conversations'}.
          </p>
        </Section>
      )}

      <Section title="Sessions">
        {confirmSignOut ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-300">Sign out everywhere, including here?</span>
            <button onClick={signOutEverywhere} disabled={signOut.pending} className={DANGER_BTN}>
              {signOut.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sign out
            </button>
            <button
              onClick={() => setConfirmSignOut(false)}
              disabled={signOut.pending}
              autoFocus
              className="btn-ghost !px-3 !py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmSignOut(true)} className="btn-ghost !px-3 !py-1.5 text-xs">
            <LogOut className="h-3.5 w-3.5" /> Sign out of all devices
          </button>
        )}
        <Note status={signOut.status} />
      </Section>

      <section className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400">Danger zone</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Deleting your account permanently removes your conversations, memories (including search vectors), tasks,
          documents and connections. This can&apos;t be undone.
        </p>
        <label htmlFor="settings-delete" className="mt-3 block text-xs text-slate-400">
          Type <span className="font-medium text-slate-200">{user.email}</span> to confirm
        </label>
        <input
          id="settings-delete"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="input-dark mt-1.5 !py-2 text-xs"
        />
        <button
          onClick={deleteAccount}
          disabled={typed.trim().toLowerCase() !== user.email.toLowerCase() || remove.pending}
          className={`mt-3 ${DANGER_BTN}`}
        >
          {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete account
        </button>
        <Note status={remove.status} />
      </section>
    </>
  );
}

/** Inactive panels stay mounted (just hidden), so a revealed token or a pending Telegram link survives tab switches. */
function Panel({ id, tab, children }: { id: SettingsTab; tab: SettingsTab; children: React.ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`settings-panel-${id}`}
      aria-labelledby={`settings-tab-${id}`}
      hidden={id !== tab}
      className="space-y-6"
    >
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

/** Icon, title and description, with the control on the right (it wraps below on narrow screens). */
function Row({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Bell;
  title: string;
  desc: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Icon className="h-4 w-4 shrink-0 text-violet-300" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-slate-200">{title}</p>
        <p className="text-xs leading-relaxed text-slate-500">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-violet-600' : 'bg-wash/[0.15]'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      // Clipboard needs a secure context; if it's missing the text is still select-all for a manual copy.
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {}
        )
      }
      className="btn-icon shrink-0"
      aria-label={label}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

/** Inline result line. The live region stays mounted so screen readers announce each change. */
function Note({ status }: { status: Status }) {
  return (
    <p aria-live="polite" className="text-xs">
      {status && <span className={`mt-2 block ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>{status.text}</span>}
    </p>
  );
}
