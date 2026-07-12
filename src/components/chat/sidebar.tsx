'use client';

import { useState } from 'react';
import { MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react';
import type { Conversation, User } from '@/lib/types';
import { SettingsModal } from '@/components/settings/settings-modal';

type Props = {
  user: User;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
  onUserUpdate: (user: User) => void;
};

export function Sidebar({
  user,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onLogout,
  onUserUpdate,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-edge bg-surface/60 md:flex">
      <div className="flex items-center gap-2 px-5 py-5 font-display text-lg font-bold">
        <Sparkles className="h-5 w-5 text-violet-400" />
        <span className="text-gradient">SABA</span>
      </div>

      <div className="px-3">
        <button onClick={onNew} className="btn-primary w-full !py-2 text-sm">
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </button>
      </div>

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {conversations.length === 0 && (
          <p className="px-2 pt-4 text-center text-xs text-slate-600">
            No conversations yet — say hi!
          </p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center rounded-xl transition ${
              c.id === activeId ? 'bg-wash/[0.08]' : 'hover:bg-wash/[0.04]'
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              className="min-w-0 flex-1 px-3 py-2.5 text-left"
            >
              <span className="block truncate text-sm text-slate-300">{c.title}</span>
            </button>
            <button
              onClick={() => onDelete(c.id)}
              className="mr-2 hidden rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 group-hover:block"
              aria-label={`Delete ${c.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-edge p-4">
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={user}
          onUserUpdate={onUserUpdate}
          onLogout={onLogout}
        />
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex w-full min-w-0 items-center gap-3 rounded-xl p-1 text-left transition hover:bg-wash/[0.05]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </button>
      </div>
    </aside>
  );
}
