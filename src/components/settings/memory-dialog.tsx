'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, CalendarHeart, ExternalLink, FileText, History, Loader2, Orbit, Plus, Trash2, Upload, X } from 'lucide-react';
import type { Doc, Memory, MemoryCategory } from '@/lib/types';

const CATEGORY_STYLE: Record<MemoryCategory, string> = {
  fact: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  preference: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  goal: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  summary: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

const FILTERS = ['all', 'fact', 'preference', 'goal', 'summary'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Current and past (superseded/retired) memories. */
  memories: Memory[];
  onAddMemory: (content: string, category: MemoryCategory) => Promise<void> | void;
  onForget: (id: string) => Promise<void> | void;
  onOpenSource: (conversationId: string, messageId: string | null) => void;
  onOpenGalaxy: () => void;
  documents: Doc[];
  uploading: boolean;
  onUploadDocument: (file: File) => void;
  onDeleteDocument: (id: string) => void;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Centered dialog: everything SABA knows about the user, how it changed, and where it came from. */
export function MemoryDialog({
  open,
  onClose,
  memories,
  onAddMemory,
  onForget,
  onOpenSource,
  onOpenGalaxy,
  documents,
  uploading,
  onUploadDocument,
  onDeleteDocument,
}: Props) {
  const [tab, setTab] = useState<'memories' | 'documents'>('memories');
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('fact');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const current = useMemo(() => memories.filter((m) => !m.validTo), [memories]);
  // Predecessor chains: a fact's history is every older fact that (transitively) points at it.
  const history = useMemo(() => {
    const byNext = new Map<string, Memory[]>();
    for (const m of memories) if (m.supersededBy) byNext.set(m.supersededBy, [...(byNext.get(m.supersededBy) ?? []), m]);
    const chain = (id: string): Memory[] => (byNext.get(id) ?? []).flatMap((m) => [m, ...chain(m.id)]);
    return chain;
  }, [memories]);

  if (!open) return null;

  const add = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    await onAddMemory(trimmed, category);
  };

  const visible = filter === 'all' ? current : current.filter((m) => m.category === filter);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="memory-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="animate-fade-up glass-deep relative flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-surface/95 p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="memory-title" className="flex items-center gap-2 font-display text-base font-bold">
            <Brain className="h-4 w-4 text-violet-300" />
            SABA&apos;s memory of you
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">{current.length}</span>
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={onOpenGalaxy} className="btn-ghost !px-2.5 !py-1.5 text-xs">
              <Orbit className="h-3.5 w-3.5" /> Galaxy
            </button>
            <button onClick={onClose} className="btn-icon" aria-label="Close memory">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-3 flex gap-1 rounded-xl border border-edge bg-wash/[0.03] p-1" role="tablist">
          {(['memories', 'documents'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition ${
                tab === t ? 'bg-wash/[0.08] text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'documents' ? `Documents (${documents.length})` : 'Memories'}
            </button>
          ))}
        </div>

        {tab === 'memories' ? (
          <>
            <div className="mb-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="Teach SABA something about you…"
                aria-label="New memory"
                maxLength={500}
                className="input-dark !py-2 text-xs"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MemoryCategory)}
                className="input-dark !w-28 !px-2 !py-2 text-xs"
                aria-label="Memory type"
              >
                <option value="fact">Fact</option>
                <option value="preference">Preference</option>
                <option value="goal">Goal</option>
              </select>
              <button onClick={add} className="btn-primary !px-3 !py-2" aria-label="Add memory">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                    filter === f ? 'border-violet-500/40 bg-violet-500/15 text-violet-200' : 'border-edge text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {f === 'summary' ? 'summaries' : f}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {visible.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs leading-relaxed text-slate-600">
                  {current.length === 0
                    ? "SABA hasn't learned anything yet. Facts it picks up from your chats appear here."
                    : 'Nothing in this category yet.'}
                </p>
              ) : (
                visible.map((m) => {
                  const past = history(m.id);
                  return (
                    <div key={m.id} className="group glass rounded-xl p-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLE[m.category]}`}>
                              {m.category}
                              {m.source === 'extracted' ? ' · learned' : ' · added by you'}
                            </span>
                            {m.eventDate && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/20 bg-pink-500/10 px-2 py-0.5 text-[10px] text-pink-300">
                                <CalendarHeart className="h-3 w-3" />
                                {MONTHS[Number(m.eventDate.slice(0, 2)) - 1]} {Number(m.eventDate.slice(3))}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-600" title={`Importance ${m.importance}/10 · recalled ${m.useCount}×`}>
                              {'●'.repeat(Math.ceil(m.importance / 4))}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{m.content}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                            {m.sourceConversationId ? (
                              <button
                                onClick={() => onOpenSource(m.sourceConversationId!, m.sourceMessageId)}
                                className="inline-flex items-center gap-1 hover:text-violet-300"
                                title="Why do you know this?"
                              >
                                Learned in “{m.sourceConversationTitle ?? 'a conversation'}” <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : (
                              <span>Since {day(m.validFrom)}</span>
                            )}
                            {past.length > 0 && (
                              <button
                                onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                                className="inline-flex items-center gap-1 hover:text-slate-300"
                                aria-expanded={expanded === m.id}
                              >
                                <History className="h-3 w-3" /> {past.length} earlier version{past.length === 1 ? '' : 's'}
                              </button>
                            )}
                          </div>
                        </div>
                        {confirm === m.id ? (
                          <button
                            onClick={async () => {
                              setConfirm(null);
                              await onForget(m.id);
                            }}
                            onBlur={() => setConfirm(null)}
                            autoFocus
                            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/10"
                          >
                            Forget?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirm(m.id)}
                            className="btn-icon !p-1 opacity-0 hover:!text-red-400 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                            aria-label={`Forget: ${m.content}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {expanded === m.id && (
                        <ol className="mt-2 space-y-1 border-l border-edge pl-3 text-[11px] text-slate-500">
                          {past.map((p) => (
                            <li key={p.id}>
                              <span className="line-through decoration-slate-600">{p.content}</span>{' '}
                              <span className="text-slate-600">
                                ({day(p.validFrom)} – {p.validTo ? day(p.validTo) : 'now'})
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.txt,.md,.markdown,.csv,.json,application/pdf,text/plain,text/markdown"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadDocument(file);
                e.target.value = '';
              }}
            />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-ghost mb-3 w-full text-xs">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Reading document…' : 'Add a PDF, notes or Markdown (max 4 MB)'}
            </button>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              SABA reads documents into memory and cites them when it uses them — leases, policies, recipes, notes.
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {documents.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-slate-600">No documents yet.</p>
              ) : (
                documents.map((d) => (
                  <div key={d.id} className="group glass flex items-center gap-3 rounded-xl p-3">
                    <FileText className="h-4 w-4 shrink-0 text-violet-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">{d.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {d.pages ? `${d.pages} page${d.pages === 1 ? '' : 's'} · ` : ''}
                        {d.chunks} section{d.chunks === 1 ? '' : 's'} · {day(d.createdAt)}
                      </p>
                    </div>
                    {confirm === d.id ? (
                      <button
                        onClick={() => {
                          setConfirm(null);
                          onDeleteDocument(d.id);
                        }}
                        onBlur={() => setConfirm(null)}
                        autoFocus
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/10"
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirm(d.id)}
                        className="btn-icon !p-1 opacity-0 hover:!text-red-400 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                        aria-label={`Delete ${d.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
