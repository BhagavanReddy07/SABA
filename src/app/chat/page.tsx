'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, EyeOff, Loader2, Mail, Menu, PanelRight, RefreshCcw, Share2, Sparkles, X } from 'lucide-react';
import type {
  ChatStreamEvent,
  Conversation,
  Doc,
  Goal,
  Memory,
  MemoryCategory,
  MemoryUpdate,
  Message,
  PublicConfig,
  Task,
  ToolStep,
  User,
} from '@/lib/types';
import { Sidebar } from '@/components/chat/sidebar';
import { Messages } from '@/components/chat/messages';
import { Composer, type Attachment } from '@/components/chat/composer';
import { TasksPanel } from '@/components/chat/tasks-panel';
import { PulseCards } from '@/components/chat/pulse-cards';
import { TalkMode } from '@/components/chat/talk-mode';
import { WrappedDialog } from '@/components/chat/wrapped-dialog';
import { MemoryDialog } from '@/components/settings/memory-dialog';
import { MemoryGalaxy } from '@/components/settings/memory-galaxy';
import { SettingsDialog, type SettingsTab } from '@/components/settings/settings-dialog';
import { Toasts, useToasts } from '@/components/ui/toasts';
import { useTheme } from '@/lib/use-theme';
import { useVoiceLang } from '@/lib/prefs';
import { actionUrl, isWebLink } from '@/lib/actions';
import { readEvents } from '@/lib/sse';
import { stripCitations } from '@/lib/citations';
import { secondPerson } from '@/lib/format';

const STREAMING_ID = '__streaming__';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Removes the last user message and everything after it (regenerate / edit). */
function dropLastTurn(list: Message[]): Message[] {
  const i = list.map((m) => m.role).lastIndexOf('user');
  return i >= 0 ? list.slice(0, i) : list;
}

function upsertTasks(prev: Task[], changed: Task[]): Task[] {
  const ids = new Set(changed.map((t) => t.id));
  return [...changed.filter((t) => !prev.some((p) => p.id === t.id)), ...prev.map((p) => (ids.has(p.id) ? changed.find((t) => t.id === p.id)! : p))];
}

function upsertStep(steps: ToolStep[], step: ToolStep): ToolStep[] {
  return steps.some((s) => s.id === step.id) ? steps.map((s) => (s.id === step.id ? step : s)) : [...steps, step];
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [thinking, setThinking] = useState(false); // waiting for the first token
  const [streaming, setStreaming] = useState(false); // generation in flight
  const [failed, setFailed] = useState<{ text: string; attachments: Attachment[]; replace: boolean; error: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settings, setSettings] = useState<{ open: boolean; tab?: SettingsTab }>({ open: false });
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [galaxyOpen, setGalaxyOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [incognitoNext, setIncognitoNext] = useState(false);
  const [verifyHidden, setVerifyHidden] = useState(false);
  const { mode: themeMode, setMode: setThemeMode, light } = useTheme();
  const [voiceLangChoice, voiceLang, setVoiceLang] = useVoiceLang();
  const { toasts, push: toast, dismiss } = useToasts();
  // Readable inside long-lived callbacks (the stream loop) without stale closures.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const abortRef = useRef<AbortController | null>(null);
  const sessionLost = useRef(false);

  const prefillComposer = useCallback((text: string) => setPrefill({ text, nonce: Date.now() }), []);

  const refreshGoals = useCallback(async () => {
    const data = await getJson<{ goals: Goal[] }>('/api/goals');
    if (data) setGoals(data.goals);
  }, []);

  // --- Bootstrap: auth check, data, and deep links (?q=, ?verified=, ?calendar=) ---
  useEffect(() => {
    (async () => {
      const me = await fetch('/api/auth/me');
      if (!me.ok) {
        router.replace('/login');
        return;
      }
      setUser((await me.json()).user);
      // The tasks panel overlays the chat below 1024px — start closed there.
      setPanelOpen(window.matchMedia('(min-width: 1024px)').matches);

      const [cfg, convs, mems, tsk, gls, docs] = await Promise.all([
        getJson<PublicConfig>('/api/config'),
        getJson<{ conversations: Conversation[] }>('/api/conversations'),
        getJson<{ memories: Memory[] }>('/api/memories?history=1'),
        getJson<{ tasks: Task[] }>('/api/tasks'),
        getJson<{ goals: Goal[] }>('/api/goals'),
        getJson<{ documents: Doc[] }>('/api/documents'),
      ]);
      setConfig(cfg);
      if (convs) setConversations(convs.conversations);
      if (mems) setMemories(mems.memories);
      if (tsk) setTasks(tsk.tasks);
      if (gls) setGoals(gls.goals);
      if (docs) setDocuments(docs.documents);

      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      if (q) prefillComposer(q.slice(0, 2000));
      if (params.get('verified') === '1') toast({ text: '✓ Email verified — reminders and briefs can reach your inbox.', tone: 'success' });
      if (params.get('verified') === '0') toast({ text: 'That verification link is invalid or expired.', tone: 'error' });
      if (params.get('calendar') === 'connected') toast({ text: '📅 Google Calendar connected — ask “what’s on my calendar this week?”', tone: 'success' });
      if (params.get('calendar') === 'failed') toast({ text: 'Couldn’t connect Google Calendar — please try again.', tone: 'error' });
      if ([...params.keys()].length) window.history.replaceState(null, '', '/chat');
    })();
  }, [router, prefillComposer, toast]);

  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setFailed(null);
    setEditing(false);
    setHighlightId(null);
    setDrawerOpen(false);
  }, []);

  // Ctrl/Cmd+K → new chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat]);

  const refreshTasks = useCallback(async () => {
    if (sessionLost.current) return;
    const res = await fetch('/api/tasks').catch(() => null);
    if (res?.status === 401) {
      sessionLost.current = true;
      return;
    }
    if (res?.ok) setTasks((await res.json()).tasks);
  }, []);

  // Reminder buttons in emails, Telegram and notifications change tasks outside this tab.
  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'visible' && refreshTasks();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshTasks);
    const interval = setInterval(() => document.visibilityState === 'visible' && refreshTasks(), 15_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshTasks);
      clearInterval(interval);
    };
  }, [refreshTasks]);

  // --- Conversations ---
  const loadMessages = useCallback(async (id: string) => {
    const data = await getJson<{ messages: Message[] }>(`/api/conversations/${id}`);
    if (data && activeIdRef.current === id) setMessages(data.messages);
  }, []);

  const selectConversation = useCallback(
    async (id: string) => {
      activeIdRef.current = id;
      setActiveId(id);
      setMessages([]);
      setFailed(null);
      setEditing(false);
      setDrawerOpen(false);
      await loadMessages(id);
    },
    [loadMessages]
  );

  /** Citations, search hits and "learned in…" links land here: open the chat and flash the message. */
  const openSource = useCallback(
    async (conversationId: string, messageId: string | null) => {
      setMemoryOpen(false);
      setGalaxyOpen(false);
      setDrawerOpen(false);
      if (activeIdRef.current !== conversationId) await selectConversation(conversationId);
      if (messageId) {
        setHighlightId(messageId);
        setTimeout(() => setHighlightId((h) => (h === messageId ? null : h)), 2600);
      }
    },
    [selectConversation]
  );

  const deleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) newChat();
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  };

  const renameConversation = async (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  };

  // --- Memory ---
  const forgetMemory = useCallback(async (id: string, undo = false) => {
    await fetch(`/api/memories/${id}${undo ? '?undo=1' : ''}`, { method: 'DELETE' });
    setMemories((prev) =>
      prev
        .filter((m) => m.id !== id)
        .map((m) => (undo && m.supersededBy === id ? { ...m, validTo: null, supersededBy: null } : m))
    );
  }, []);

  const applyMemoryUpdate = useCallback(
    (update: MemoryUpdate) => {
      setMemories((prev) => {
        const changed = new Map([...update.updated.map((u) => [u.from.id, u.from] as const), ...update.retired.map((r) => [r.id, r] as const)]);
        const kept = prev.filter((m) => !update.forgotten.includes(m.id)).map((m) => changed.get(m.id) ?? m);
        const added = [...update.learned, ...update.updated.map((u) => u.to)].filter((m) => !kept.some((k) => k.id === m.id));
        return [...added, ...kept];
      });

      if (update.learned.length === 1) {
        const m = update.learned[0];
        toast({ text: `🧠 Learned: ${m.content}`, action: { label: 'Undo', run: () => void forgetMemory(m.id) } });
      } else if (update.learned.length > 1) {
        toast({
          text: `🧠 Learned ${update.learned.length} new things about you`,
          action: { label: 'Review', run: () => setMemoryOpen(true) },
        });
      }
      for (const u of update.updated) {
        toast({ text: `🧠 Updated: “${u.from.content}” → “${u.to.content}”`, action: { label: 'Undo', run: () => void forgetMemory(u.to.id, true) } });
      }
      for (const r of update.retired) toast({ text: `🧠 Noted that “${r.content}” is no longer true.` });
      if (update.forgotten.length) {
        toast({ text: `🗑 Forgot ${update.forgotten.length} memor${update.forgotten.length === 1 ? 'y' : 'ies'}.`, tone: 'success' });
      }
      if ([...update.learned, ...update.updated.map((u) => u.to)].some((m) => m.category === 'goal')) void refreshGoals();
    },
    [toast, forgetMemory, refreshGoals]
  );

  const addMemory = async (content: string, category: MemoryCategory) => {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category }),
    });
    if (res.ok) {
      const { memory } = await res.json();
      // The server returns the existing row for duplicates — don't list it twice.
      setMemories((prev) => [memory, ...prev.filter((m) => m.id !== memory.id)]);
      if (category === 'goal') void refreshGoals();
    }
  };

  // --- Chat (SSE streaming) ---
  const send = async (text: string, attachments: Attachment[] = [], replace = false) => {
    if (streaming) return;
    setFailed(null);
    setHighlightId(null);
    setEditing(false);
    const optimistic: Message = {
      id: `local-${crypto.randomUUID()}`,
      conversationId: activeIdRef.current ?? '',
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      previews: attachments.map((a) => a.preview),
      ...(attachments.length && { meta: { images: attachments.length } }),
    };
    setMessages((prev) => [...(replace ? dropLastTurn(prev) : prev), optimistic]);
    setThinking(true);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let gotDone = false;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          conversationId: activeIdRef.current ?? undefined,
          incognito: !activeIdRef.current && incognitoNext,
          replaceLastTurn: replace || undefined,
          images: attachments.map(({ mimeType, data }) => ({ mimeType, data })),
          // Local time + zone so "remind me at 6pm" resolves to the right moment.
          clientTime: new Date().toString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }

      await readEvents<ChatStreamEvent>(res.body, (event) => {
        switch (event.type) {
          case 'start': {
            const conv = event.conversation;
            activeIdRef.current = conv.id;
            setActiveId(conv.id);
            setConversations((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
            setIncognitoNext(false);
            setMessages((prev) => [
              ...prev,
              { id: STREAMING_ID, conversationId: conv.id, role: 'assistant', content: '', createdAt: new Date().toISOString(), meta: { trace: event.trace } },
            ]);
            break;
          }
          case 'delta':
            setThinking(false);
            setMessages((prev) => prev.map((m) => (m.id === STREAMING_ID ? { ...m, content: m.content + event.text } : m)));
            break;
          case 'tool':
            setThinking(false);
            setMessages((prev) =>
              prev.map((m) => (m.id === STREAMING_ID ? { ...m, meta: { ...m.meta, tools: upsertStep(m.meta?.tools ?? [], event.step) } } : m))
            );
            break;
          case 'done': {
            gotDone = true;
            const { message, userMessage } = event;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === STREAMING_ID ? message : m.id === optimistic.id ? { ...userMessage, previews: optimistic.previews } : m
              )
            );
            setThinking(false);
            setStreaming(false);
            // Auto-open the first web link; popup blockers may stop it, so the card stays clickable.
            const first = message.meta?.actions?.[0];
            if (first && isWebLink(actionUrl(first))) window.open(actionUrl(first), '_blank', 'noopener');
            if (message.meta?.tasks?.length) setTasks((prev) => upsertTasks(prev, message.meta!.tasks!));
            break;
          }
          case 'title':
            setConversations((prev) => prev.map((c) => (c.id === event.conversationId ? { ...c, title: event.title } : c)));
            break;
          case 'memory':
            applyMemoryUpdate(event.update);
            break;
          case 'error':
            throw new Error(event.message);
        }
      });
      if (!gotDone) throw new Error('The reply was cut off — please try again.');
    } catch (err) {
      if (controller.signal.aborted && !gotDone) {
        // Stopped: keep what streamed. The server saved the turn — reload for the real ids.
        setMessages((prev) =>
          prev.map((m) => (m.id === STREAMING_ID ? { ...m, id: `local-${crypto.randomUUID()}`, meta: { ...m.meta, notice: 'Stopped' } } : m))
        );
        const cid = activeIdRef.current;
        if (cid) setTimeout(() => void loadMessages(cid), 1500);
      } else if (!gotDone) {
        setFailed({ text, attachments, replace, error: (err as Error).message });
        setMessages((prev) => prev.filter((m) => m.id !== STREAMING_ID && m.id !== optimistic.id));
      }
    } finally {
      setThinking(false);
      setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    if (lastUser.meta?.images && !lastUser.previews?.length) {
      toast({ text: 'Images aren’t stored, so this regenerates from the text only.' });
    }
    void send(lastUser.content, [], true);
  };

  const editLast = (message: Message) => {
    setEditing(true);
    prefillComposer(message.content);
  };

  // --- Export / share ---
  const exportConversation = () => {
    if (messages.length === 0) return;
    const title = conversations.find((c) => c.id === activeId)?.title ?? 'SABA conversation';
    const md = [
      `# ${title}`,
      '',
      ...messages.map((m) => `**${m.role === 'user' ? user?.name ?? 'You' : 'SABA'}:**\n\n${stripCitations(m.content)}\n`),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w\s-]/g, '').trim() || 'conversation'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const unshare = async (id: string) => {
    await fetch(`/api/conversations/${id}/share`, { method: 'DELETE' });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, shared: false } : c)));
    toast({ text: 'Share link turned off.' });
  };

  const share = async () => {
    const id = activeId;
    if (!id) return;
    const res = await fetch(`/api/conversations/${id}/share`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ text: data.error ?? 'Could not create a share link.', tone: 'error' });
      return;
    }
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, shared: true } : c)));
    let copied = true;
    try {
      await navigator.clipboard.writeText(data.url);
    } catch {
      copied = false;
    }
    toast({
      text: copied ? 'Read-only link copied — anyone with it can read this chat.' : `Share link: ${data.url}`,
      action: { label: 'Stop sharing', run: () => void unshare(id) },
    });
  };

  // --- Documents ---
  const uploadDocument = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast({ text: `${file.name} is over 4 MB.`, tone: 'error' });
      return;
    }
    setUploading(true);
    const pending = toast({ text: `Reading ${file.name}…` });
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setDocuments((prev) => [data.doc, ...prev]);
      toast({
        text: `📄 ${file.name} is in memory (${data.doc.chunks} section${data.doc.chunks === 1 ? '' : 's'}) — ask me about it.`,
        tone: 'success',
      });
    } catch (err) {
      toast({ text: (err as Error).message, tone: 'error' });
    } finally {
      dismiss(pending);
      setUploading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
  };

  // --- Tasks ---
  const addTask = async (content: string, dueAt: string | undefined, priority: Task['priority']) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, dueAt, priority }),
    });
    if (res.ok) {
      const { task } = await res.json();
      setTasks((prev) => [task, ...prev]);
    }
  };

  const toggleTask = async (task: Task) => {
    const completed = !task.completedAt;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completedAt: completed ? new Date().toISOString() : null } : t)));
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  };

  const resendVerification = async () => {
    const res = await fetch('/api/auth/verify', { method: 'POST' });
    toast(
      res.ok
        ? { text: '✉️ Verification email sent — check your inbox.', tone: 'success' }
        : { text: res.status === 429 ? 'Please wait before requesting another email.' : 'Could not send the email.', tone: 'error' }
    );
  };

  const logout = async () => {
    if (sessionLost.current) return; // ignore repeat clicks
    sessionLost.current = true;
    // Navigate immediately — the cookie-clearing request finishes in the background.
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    );
  }

  const active = conversations.find((c) => c.id === activeId);
  const liveReply = messages.find((m) => m.id === STREAMING_ID)?.content ?? '';
  const currentMemories = memories.filter((m) => !m.validTo);
  const composerProps = {
    onSend: (text: string, attachments: Attachment[]) => void send(text, attachments, editing),
    streaming,
    onStop: () => abortRef.current?.abort(),
    prefill,
    editing,
    onCancelEdit: () => {
      setEditing(false);
      prefillComposer('');
    },
    voiceLang,
    onTalk: () => setTalkOpen(true),
    allowImages: Boolean(config?.vision),
    onUploadDocument: (file: File) => void uploadDocument(file),
  };

  return (
    // `light` here scopes the theme to the chat page — landing/login stay dark.
    <div className={`relative flex h-screen overflow-hidden bg-ink text-slate-200 transition-colors duration-300 ${light ? 'light' : ''}`}>
      <div className="aurora" />

      <Sidebar
        user={user}
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => void selectConversation(id)}
        onOpenMessage={(cid, mid) => void openSource(cid, mid)}
        onNew={newChat}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onOpenSettings={() => setSettings({ open: true })}
        onOpenGalaxy={() => setGalaxyOpen(true)}
        onOpenWrapped={() => setWrappedOpen(true)}
        mobileOpen={drawerOpen}
        onMobileClose={() => setDrawerOpen(false)}
      />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-edge bg-ink/40 px-4 py-3 backdrop-blur-md md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setDrawerOpen(true)} className="btn-icon md:hidden" aria-label="Open conversations">
              <Menu className="h-4 w-4" />
            </button>
            <Sparkles className="hidden h-4 w-4 shrink-0 text-violet-400 md:block" />
            <h1 className="truncate text-sm font-medium text-slate-300">{active?.title ?? 'New conversation'}</h1>
            {(active?.incognito || (!activeId && incognitoNext)) && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-[10px] text-slate-400"
                title="SABA doesn't learn from or recall incognito chats"
              >
                <EyeOff className="h-3 w-3" /> Incognito
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activeId && messages.length > 0 && !active?.incognito && (
              <button onClick={share} className={`btn-icon ${active?.shared ? '!text-violet-300' : ''}`} aria-label="Share a read-only link" title={active?.shared ? 'Shared — click to copy the link again' : 'Share'}>
                <Share2 className="h-4 w-4" />
              </button>
            )}
            {messages.length > 0 && (
              <button onClick={exportConversation} className="btn-icon" aria-label="Export conversation as Markdown" title="Export as Markdown">
                <Download className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className={`btn-icon ${panelOpen ? '!text-violet-300' : ''}`}
              aria-label="Toggle tasks and goals panel"
              aria-pressed={panelOpen}
              title="Tasks & goals"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {config?.email && !user.emailVerified && !verifyHidden && (
          <div className="flex items-center gap-3 border-b border-edge bg-violet-500/[0.06] px-4 py-2 text-xs text-slate-300">
            <Mail className="h-3.5 w-3.5 shrink-0 text-violet-300" />
            <span className="min-w-0 flex-1">Verify your email to get reminders and your morning brief by email.</span>
            <button onClick={resendVerification} className="shrink-0 font-semibold text-violet-300 hover:text-violet-200">
              Send link
            </button>
            <button onClick={() => setVerifyHidden(true)} className="btn-icon !p-1" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !thinking ? (
            <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
              <div className="animate-fade-up mb-8 flex items-center gap-3 text-center">
                <Sparkles className="h-7 w-7 text-violet-400" />
                <h2 className="font-display text-3xl font-medium tracking-tight text-slate-100 md:text-4xl">
                  {greeting()}, {user.name.split(' ')[0]}
                </h2>
              </div>
              <div className="animate-fade-up w-full" style={{ animationDelay: '100ms' }}>
                <Composer
                  {...composerProps}
                  variant="hero"
                  footer={
                    <div className="mx-auto mt-3 flex max-w-2xl items-center justify-between px-2 text-xs text-slate-600">
                      <span>I remember what you tell me — across conversations.</span>
                      <button
                        onClick={() => setIncognitoNext((v) => !v)}
                        aria-pressed={incognitoNext}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                          incognitoNext ? 'border-violet-500/40 bg-violet-500/10 text-violet-200' : 'border-edge text-slate-500 hover:text-slate-300'
                        }`}
                        title="SABA won't learn from or recall this chat"
                      >
                        <EyeOff className="h-3 w-3" /> Incognito
                      </button>
                    </div>
                  }
                />
              </div>
              <div className="animate-fade-up w-full" style={{ animationDelay: '200ms' }}>
                <PulseCards
                  user={user}
                  tasks={tasks}
                  memories={memories}
                  goals={goals}
                  onPrefill={prefillComposer}
                  onOpenTasks={() => setPanelOpen(true)}
                  onOpenMemory={() => setMemoryOpen(true)}
                />
              </div>
            </div>
          ) : (
            <Messages
              messages={messages}
              thinking={thinking}
              streamingId={streaming ? STREAMING_ID : null}
              highlightId={highlightId}
              voiceLang={voiceLang}
              onOpenSource={(cid, mid) => void openSource(cid, mid)}
              onRegenerate={regenerate}
              onEdit={editLast}
            />
          )}
        </div>

        {failed && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300" role="alert">
            <span className="min-w-0">{failed.error || 'That message didn’t go through.'}</span>
            <button
              onClick={() => void send(failed.text, failed.attachments, failed.replace)}
              className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-red-200 hover:text-white"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {(messages.length > 0 || thinking) && <Composer {...composerProps} />}
      </main>

      {panelOpen && (
        <TasksPanel
          tasks={tasks}
          goals={goals}
          onAddTask={addTask}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onCheckIn={(g) => prefillComposer(`Progress on my goal “${secondPerson(g.memory.content)}”: `)}
          onClose={() => setPanelOpen(false)}
        />
      )}

      <MemoryDialog
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        memories={memories}
        onAddMemory={addMemory}
        onForget={(id) => forgetMemory(id)}
        onOpenSource={(cid, mid) => void openSource(cid, mid)}
        onOpenGalaxy={() => {
          setMemoryOpen(false);
          setGalaxyOpen(true);
        }}
        documents={documents}
        uploading={uploading}
        onUploadDocument={(file) => void uploadDocument(file)}
        onDeleteDocument={(id) => void deleteDocument(id)}
      />
      <MemoryGalaxy
        open={galaxyOpen}
        onClose={() => setGalaxyOpen(false)}
        onOpenSource={(cid, mid) => void openSource(cid, mid)}
        onForget={(id) => forgetMemory(id)}
      />
      <WrappedDialog open={wrappedOpen} onClose={() => setWrappedOpen(false)} userName={user.name} />
      <SettingsDialog
        open={settings.open}
        initialTab={settings.tab}
        onClose={() => setSettings({ open: false })}
        user={user}
        onUserUpdate={setUser}
        config={config}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        voiceLang={voiceLangChoice}
        onVoiceLangChange={setVoiceLang}
        memoryCount={currentMemories.length}
        onOpenMemory={() => {
          setSettings({ open: false });
          setMemoryOpen(true);
        }}
        onLogout={logout}
      />
      <TalkMode open={talkOpen} onClose={() => setTalkOpen(false)} onSend={(text) => void send(text)} liveReply={liveReply} streaming={streaming} lang={voiceLang} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
