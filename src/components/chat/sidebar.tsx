'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  EyeOff,
  Gift,
  Loader2,
  MessageSquarePlus,
  Orbit,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Conversation, SearchHit, User } from '@/lib/types';

type Props = {
  user: User;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenSettings: () => void;
  onOpenGalaxy: () => void;
  onOpenWrapped: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

function groupLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

/** «match» markers from the server become <mark>s. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split(/(«[^»]*»)/g).map((part, i) =>
        part.startsWith('«') ? (
          <mark key={i} className="rounded bg-violet-500/25 px-0.5 text-slate-100">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function Sidebar({
  user,
  conversations,
  activeId,
  onSelect,
  onOpenMessage,
  onNew,
  onDelete,
  onRename,
  onOpenSettings,
  onOpenGalaxy,
  onOpenWrapped,
  mobileOpen,
  onMobileClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Message search (full-text + meaning) runs server-side, debounced; titles filter instantly below.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setHits((await res.json()).messages ?? []);
      } catch {
        // aborted or offline — keep title results only
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
    const out: { label: string; items: Conversation[] }[] = [];
    for (const c of filtered) {
      const label = groupLabel(c.updatedAt);
      const group = out.find((g) => g.label === label);
      if (group) group.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [conversations, query]);

  const commitRename = () => {
    if (editingId && editTitle.trim()) onRename(editingId, editTitle.trim());
    setEditingId(null);
  };

  const content = (
    <>
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <span className="text-gradient">SABA</span>
        </div>
        <button onClick={onMobileClose} className="btn-icon md:hidden" aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 px-3">
        <button onClick={onNew} className="btn-primary w-full !py-2 text-sm">
          <MessageSquarePlus className="h-4 w-4" /> New chat
          <span className="ml-auto hidden rounded border border-white/20 px-1.5 text-[10px] font-normal opacity-70 md:block">
            Ctrl K
          </span>
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search every chat…"
            aria-label="Search conversations and messages"
            className="input-dark !py-2 !pl-9 text-xs"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-500" />}
        </div>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4" aria-label="Conversations">
        {conversations.length === 0 && (
          <p className="px-2 pt-4 text-center text-xs text-slate-600">No conversations yet — say hi!</p>
        )}
        {conversations.length > 0 && groups.length === 0 && hits.length === 0 && !searching && (
          <p className="px-2 pt-4 text-center text-xs text-slate-600">Nothing matches “{query}”</p>
        )}

        {hits.length > 0 && (
          <div className="mb-2">
            <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">In messages</p>
            <div className="space-y-1">
              {hits.map((h) => (
                <button
                  key={h.messageId}
                  onClick={() => onOpenMessage(h.conversationId, h.messageId)}
                  className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-wash/[0.05]"
                >
                  <span className="block truncate text-[11px] font-medium text-slate-400">{h.conversationTitle}</span>
                  <span className="line-clamp-2 text-xs text-slate-300">
                    <Snippet text={h.snippet} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center rounded-xl transition ${c.id === activeId ? 'bg-wash/[0.08]' : 'hover:bg-wash/[0.04]'}`}
                >
                  {editingId === c.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5">
                      <input
                        autoFocus
                        value={editTitle}
                        aria-label="Conversation title"
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="input-dark !rounded-lg !px-2 !py-1 text-xs"
                      />
                      <button onClick={commitRename} className="btn-icon !p-1" aria-label="Save name">
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => onSelect(c.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2.5 text-left"
                        aria-current={c.id === activeId ? 'page' : undefined}
                      >
                        {c.incognito && <EyeOff className="h-3 w-3 shrink-0 text-slate-500" aria-label="Incognito" />}
                        <span className="block truncate text-sm text-slate-300">{c.title}</span>
                      </button>
                      {/* Visible on hover, keyboard focus, and always on touch screens. */}
                      <div className="mr-1.5 flex shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                        {confirmDelete === c.id ? (
                          <button
                            onClick={() => {
                              setConfirmDelete(null);
                              onDelete(c.id);
                            }}
                            onBlur={() => setConfirmDelete(null)}
                            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/10"
                            autoFocus
                          >
                            Delete?
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(c.id);
                                setEditTitle(c.title);
                              }}
                              className="btn-icon !p-1.5"
                              aria-label={`Rename ${c.title}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(c.id)}
                              className="btn-icon !p-1.5 hover:!bg-red-500/10 hover:!text-red-400"
                              aria-label={`Delete ${c.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-edge p-3">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={onOpenGalaxy} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs text-slate-400 transition hover:bg-wash/[0.05] hover:text-slate-200">
            <Orbit className="h-3.5 w-3.5 text-violet-300" /> Memory Galaxy
          </button>
          <button onClick={onOpenWrapped} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs text-slate-400 transition hover:bg-wash/[0.05] hover:text-slate-200">
            <Gift className="h-3.5 w-3.5 text-fuchsia-300" /> Wrapped
          </button>
        </div>
        <button
          onClick={onOpenSettings}
          className="flex w-full min-w-0 items-center gap-3 rounded-xl p-1 text-left transition hover:bg-wash/[0.05]"
          aria-label="Open settings"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-bold text-white shadow-md shadow-violet-900/40">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="relative z-10 hidden w-72 shrink-0 flex-col border-r border-edge bg-surface/60 backdrop-blur-md md:flex">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} aria-hidden />
          <aside className="animate-fade-up absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-edge bg-surface shadow-2xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
