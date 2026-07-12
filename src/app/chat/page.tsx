'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrainCircuit, Loader2, PanelRight, Sparkles } from 'lucide-react';
import type {
  ChatResponse,
  Conversation,
  Memory,
  Message,
  Task,
  User,
} from '@/lib/types';
import { Sidebar } from '@/components/chat/sidebar';
import { Messages } from '@/components/chat/messages';
import { Composer } from '@/components/chat/composer';
import { MemoryPanel } from '@/components/chat/memory-panel';

const STARTERS = [
  'Hi! My name is …, and I love …',
  'What do you remember about me?',
  'Help me plan my week',
  'Explain vector embeddings simply',
];

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [thinking, setThinking] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

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

  const refreshMemories = useCallback(async () => {
    const res = await fetch('/api/memories');
    if (res.ok) setMemories((await res.json()).memories);
  }, []);

  // --- Conversations ---
  const selectConversation = async (id: string) => {
    setActiveId(id);
    setMessages([]);
    const res = await fetch(`/api/conversations/${id}`);
    if (res.ok) setMessages((await res.json()).messages);
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
  };

  const deleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) newChat();
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  };

  // --- Chat ---
  const send = async (text: string) => {
    const optimistic: Message = {
      id: crypto.randomUUID(),
      conversationId: activeId ?? '',
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setThinking(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: activeId ?? undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ChatResponse = await res.json();

      setMessages((prev) => [...prev, data.message]);

      if (!activeId) {
        // First message created the conversation server-side.
        setActiveId(data.conversationId);
        setConversations((prev) => [
          {
            id: data.conversationId,
            title: data.title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      } else {
        setConversations((prev) => {
          const current = prev.find((c) => c.id === activeId);
          if (!current) return prev;
          return [current, ...prev.filter((c) => c.id !== activeId)];
        });
      }

      // Fact extraction runs async server-side — pick up new memories shortly after.
      setTimeout(refreshMemories, 4000);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          conversationId: activeId ?? '',
          role: 'assistant',
          content: 'Something went wrong reaching the server. Please try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setThinking(false);
    }
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
      setMemories((prev) => [memory, ...prev]);
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={user}
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={deleteConversation}
        onLogout={logout}
        onUserUpdate={setUser}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-edge px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-400 md:hidden" />
            <h1 className="truncate text-sm font-medium text-slate-300">
              {conversations.find((c) => c.id === activeId)?.title ?? 'New conversation'}
            </h1>
          </div>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className={`rounded-lg p-2 transition hover:bg-wash/[0.06] ${
              panelOpen ? 'text-violet-300' : 'text-slate-500'
            }`}
            aria-label="Toggle memory panel"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </header>

        {/* Messages / empty state */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !thinking ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="animate-float-slow mb-5 rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 p-5">
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
                    className="glass rounded-xl px-4 py-3 text-left text-xs text-slate-400 transition hover:bg-wash/[0.08] hover:text-slate-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Messages messages={messages} thinking={thinking} />
          )}
        </div>

        <Composer onSend={send} disabled={thinking} />
      </main>

      {panelOpen && (
        <MemoryPanel
          memories={memories}
          tasks={tasks}
          onAddMemory={addMemory}
          onDeleteMemory={deleteMemory}
          onAddTask={addTask}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
