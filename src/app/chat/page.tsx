'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BrainCircuit,
  Download,
  Loader2,
  Menu,
  PanelRight,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';
import type {
  ChatStreamEvent,
  Conversation,
  Memory,
  Message,
  Task,
  User,
} from '@/lib/types';
import { Sidebar } from '@/components/chat/sidebar';
import { Messages } from '@/components/chat/messages';
import { Composer } from '@/components/chat/composer';
import { TasksPanel } from '@/components/chat/tasks-panel';
import { useTheme } from '@/lib/use-theme';
import { actionUrl } from '@/lib/actions';

const STARTERS = [
  'Hi! My name is …, and I love …',
  'What do you remember about me?',
  'Help me plan my week',
  'Explain vector embeddings simply',
];

const STREAMING_ID = '__streaming__';

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [thinking, setThinking] = useState(false); // waiting for first token
  const [streaming, setStreaming] = useState(false); // any generation in flight
  const [failedText, setFailedText] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode: themeMode, setMode: setThemeMode, light } = useTheme();
  // activeId at send time, readable inside the stream loop without stale closures
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // --- Bootstrap: auth check + initial data ---
  useEffect(() => {
    (async () => {
      const me = await fetch('/api/auth/me');
      if (!me.ok) {
        router.replace('/login');
        return;
      }
      setUser((await me.json()).user);

      const [convRes, memRes, taskRes] = await Promise.all([
        fetch('/api/conversations'),
        fetch('/api/memories'),
        fetch('/api/tasks'),
      ]);
      if (convRes.ok) setConversations((await convRes.json()).conversations);
      if (memRes.ok) setMemories((await memRes.json()).memories);
      if (taskRes.ok) setTasks((await taskRes.json()).tasks);
    })();
  }, [router]);

  // Ctrl/Cmd+K → new chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveId(null);
        setMessages([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refreshMemories = useCallback(async () => {
    const res = await fetch('/api/memories');
    if (res.ok) setMemories((await res.json()).memories);
  }, []);

  const refreshConversations = useCallback(async () => {
    const res = await fetch('/api/conversations');
    if (res.ok) setConversations((await res.json()).conversations);
  }, []);

  // --- Conversations ---
  const selectConversation = async (id: string) => {
    setActiveId(id);
    setMessages([]);
    setDrawerOpen(false);
    const res = await fetch(`/api/conversations/${id}`);
    if (res.ok) setMessages((await res.json()).messages);
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setFailedText(null);
    setDrawerOpen(false);
  };

  const deleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) newChat();
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  };

  const renameConversation = async (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  };

  // --- Chat (SSE streaming) ---
  const send = async (text: string) => {
    setFailedText(null);
    const optimistic: Message = {
      id: crypto.randomUUID(),
      conversationId: activeId ?? '',
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setThinking(true);
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: activeId ?? undefined }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawDone = false;

      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case 'start': {
            if (!activeIdRef.current) {
              setActiveId(event.conversationId);
              setConversations((prev) => [
                {
                  id: event.conversationId,
                  title: event.title,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                ...prev,
              ]);
            } else {
              setConversations((prev) => {
                const current = prev.find((c) => c.id === event.conversationId);
                if (!current) return prev;
                return [current, ...prev.filter((c) => c.id !== event.conversationId)];
              });
            }
            break;
          }
          case 'delta': {
            setThinking(false);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.id === STREAMING_ID) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + event.text },
                ];
              }
              return [
                ...prev,
                {
                  id: STREAMING_ID,
                  conversationId: activeIdRef.current ?? '',
                  role: 'assistant',
                  content: event.text,
                  createdAt: new Date().toISOString(),
                },
              ];
            });
            break;
          }
          case 'done': {
            sawDone = true;
            setMessages((prev) =>
              prev.map((m) => (m.id === STREAMING_ID ? event.message : m))
            );
            // Auto-open the requested app; popup blockers may stop this,
            // so the message also renders a clickable action card.
            if (event.message.action) {
              window.open(actionUrl(event.message.action), '_blank', 'noopener');
            }
            break;
          }
          case 'error':
            throw new Error(event.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (line) handleEvent(JSON.parse(line.slice(5).trim()));
        }
      }
      if (!sawDone) throw new Error('Stream ended early');

      // Fact extraction + auto-title run async server-side — pick them up shortly.
      setTimeout(refreshMemories, 4000);
      setTimeout(refreshConversations, 4000);
    } catch {
      setFailedText(text);
      setMessages((prev) =>
        prev.filter((m) => m.id !== STREAMING_ID && m.id !== optimistic.id)
      );
    } finally {
      setThinking(false);
      setStreaming(false);
    }
  };

  // --- Export current conversation as Markdown ---
  const exportConversation = () => {
    if (messages.length === 0) return;
    const title =
      conversations.find((c) => c.id === activeId)?.title ?? 'SABA conversation';
    const md = [
      `# ${title}`,
      '',
      ...messages.map(
        (m) => `**${m.role === 'user' ? user?.name ?? 'You' : 'SABA'}:**\n\n${m.content}\n`
      ),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w\s-]/g, '').trim() || 'conversation'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Memories & tasks ---
  const addMemory = async (content: string) => {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const { memory } = await res.json();
      // Server returns the existing row for duplicates — avoid listing it twice.
      setMemories((prev) => [memory, ...prev.filter((m) => m.id !== memory.id)]);
    }
  };

  const deleteMemory = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/memories/${id}`, { method: 'DELETE' });
  };

  const addTask = async (content: string) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const { task } = await res.json();
      setTasks((prev) => [task, ...prev]);
    }
  };

  const toggleTask = async (task: Task) => {
    const completed = !task.completedAt;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, completedAt: completed ? new Date().toISOString() : null }
          : t
      )
    );
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

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    );
  }

  const activeTitle = conversations.find((c) => c.id === activeId)?.title;

  return (
    // `light` here scopes the theme to the chat page — landing/login stay dark.
    <div
      className={`relative flex h-screen overflow-hidden bg-ink text-slate-200 transition-colors duration-300 ${light ? 'light' : ''}`}
    >
      <div className="aurora" />

      <Sidebar
        user={user}
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onLogout={logout}
        onUserUpdate={setUser}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        mobileOpen={drawerOpen}
        onMobileClose={() => setDrawerOpen(false)}
        memories={memories}
        onAddMemory={addMemory}
        onDeleteMemory={deleteMemory}
      />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-edge bg-ink/40 px-4 py-3 backdrop-blur-md md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="btn-icon md:hidden"
              aria-label="Open conversations"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Sparkles className="hidden h-4 w-4 shrink-0 text-violet-400 md:block" />
            <h1 className="truncate text-sm font-medium text-slate-300">
              {activeTitle ?? 'New conversation'}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={exportConversation}
                className="btn-icon"
                aria-label="Export conversation as Markdown"
                title="Export as Markdown"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className={`btn-icon ${panelOpen ? '!text-violet-300' : ''}`}
              aria-label="Toggle tasks panel"
              title="Tasks"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Messages / empty state */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !thinking ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="animate-float-slow mb-5 rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 p-5 shadow-lg shadow-violet-900/20">
                <BrainCircuit className="h-10 w-10 text-violet-300" />
              </div>
              <h2 className="font-display text-2xl font-bold">
                Hey {user.name.split(' ')[0]} 👋
              </h2>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                I remember what you tell me — across conversations. The more we talk, the
                better I get.
              </p>
              <div className="mt-8 grid w-full max-w-md gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="glass rounded-xl px-4 py-3 text-left text-xs text-slate-400 transition hover:-translate-y-0.5 hover:bg-wash/[0.08] hover:text-slate-200 hover:shadow-lg hover:shadow-violet-900/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-8 text-[11px] text-slate-600">
                Tip: <kbd className="rounded border border-edge px-1.5 py-0.5">Ctrl</kbd>+
                <kbd className="rounded border border-edge px-1.5 py-0.5">K</kbd> starts a
                fresh chat anytime
              </p>
            </div>
          ) : (
            <Messages
              messages={messages}
              thinking={thinking}
              streamingId={streaming ? STREAMING_ID : null}
            />
          )}
        </div>

        {failedText && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            <span>That message didn&apos;t go through.</span>
            <button
              onClick={() => send(failedText)}
              className="inline-flex items-center gap-1.5 font-semibold text-red-200 hover:text-white"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        <Composer onSend={send} disabled={streaming} />
      </main>

      {panelOpen && (
        <TasksPanel
          tasks={tasks}
          onAddTask={addTask}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
