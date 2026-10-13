'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BrainCircuit,
  CalendarPlus,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Music,
  Pencil,
  Phone,
  RefreshCcw,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  Waypoints,
  XCircle,
  Youtube,
  Zap,
  BookOpen,
  Navigation,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Components } from 'react-markdown';
import type { DeepLinkAction, MemorySource, MemoryTrace, Message, Task, ToolStep } from '@/lib/types';
import { actionDetail, actionLabel, actionUrl, isWebLink } from '@/lib/actions';
import { linkCitations, stripCitations } from '@/lib/citations';
import { downloadIcs, googleCalendarUrl } from '@/lib/calendar';

type Props = {
  messages: Message[];
  thinking: boolean;
  streamingId: string | null;
  /** Message to scroll to and flash (opened from a citation, search hit or memory). */
  highlightId: string | null;
  voiceLang: string;
  onOpenSource: (conversationId: string, messageId: string | null) => void;
  /** Re-run the last turn (shown on the last reply). */
  onRegenerate?: () => void;
  /** Edit and resend the last user message. */
  onEdit?: (message: Message) => void;
};

export function Messages({ messages, thinking, streamingId, highlightId, voiceLang, onOpenSource, onRegenerate, onEdit }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastContent = messages[messages.length - 1]?.content;
  const busy = Boolean(streamingId) || thinking;

  useEffect(() => {
    if (!highlightId) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, thinking, lastContent, highlightId]);

  useEffect(() => {
    if (highlightId) document.getElementById(`msg-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, messages.length]);

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = messages[messages.length - 1]?.role === 'assistant' ? messages[messages.length - 1] : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          isStreaming={m.id === streamingId}
          highlighted={m.id === highlightId}
          voiceLang={voiceLang}
          onOpenSource={onOpenSource}
          onRegenerate={!busy && m === lastAssistant ? onRegenerate : undefined}
          onEdit={!busy && m === lastUser && onEdit ? () => onEdit(m) : undefined}
        />
      ))}
      {thinking && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

const NO_SOURCES: MemorySource[] = [];

const MARKDOWN: Components = {
  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-slate-100" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: ({ node, ...props }) => <li {...props} />,
  code: ({ node, className, ...props }) =>
    className?.includes('language-') ? (
      <code className="mb-2 block overflow-x-auto rounded-lg bg-wash/[0.08] p-3 text-xs last:mb-0" {...props} />
    ) : (
      <code className="rounded bg-wash/[0.12] px-1 py-0.5 text-[0.85em]" {...props} />
    ),
  table: ({ node, ...props }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => <th className="border-b border-edge px-2 py-1 text-left font-semibold" {...props} />,
  td: ({ node, ...props }) => <td className="border-b border-edge px-2 py-1 align-top" {...props} />,
  h1: ({ node, ...props }) => <h3 className="mb-1 mt-2 text-base font-semibold first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h3 className="mb-1 mt-2 text-base font-semibold first:mt-0" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props} />,
};

function MessageBubble({
  message,
  isStreaming,
  highlighted,
  voiceLang,
  onOpenSource,
  onRegenerate,
  onEdit,
}: {
  message: Message;
  isStreaming: boolean;
  highlighted: boolean;
  voiceLang: string;
  onOpenSource: Props['onOpenSource'];
  onRegenerate?: () => void;
  onEdit?: () => void;
}) {
  const isUser = message.role === 'user';
  const meta = message.meta;
  const sources = meta?.trace?.sources ?? NO_SOURCES;

  // Citations become links that the `a` renderer turns into chips.
  const components = useMemo<Components>(() => {
    const byRef = new Map(sources.map((s) => [s.ref, s]));
    return {
      ...MARKDOWN,
      a: ({ node, href, children, ...props }) => {
        const ref = href?.startsWith('#cite:') ? href.slice(6) : null;
        const source = ref ? byRef.get(ref) : undefined;
        if (source) return <CitationChip source={source} onOpenSource={onOpenSource} />;
        return (
          <a className="text-violet-300 underline hover:text-violet-200" target="_blank" rel="noreferrer" href={href} {...props}>
            {children}
          </a>
        );
      },
    };
  }, [sources, onOpenSource]);

  const content = useMemo(
    () => (isUser ? message.content : linkCitations(message.content, new Set(sources.map((s) => s.ref)))),
    [isUser, message.content, sources]
  );

  return (
    <div
      id={`msg-${message.id}`}
      className={`animate-fade-up flex scroll-mt-24 gap-3 ${isUser ? 'flex-row-reverse' : ''} ${highlighted ? 'saba-flash' : ''}`}
    >
      {!isUser && (
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 shadow-md shadow-violet-900/40 ${isStreaming ? 'animate-pulse-glow' : ''}`}
          aria-hidden
        >
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}
      <div className={`group min-w-0 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {isUser && message.previews?.length ? (
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            {message.previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
              <img key={i} src={src} alt={`Attached image ${i + 1}`} className="h-24 w-24 rounded-xl border border-edge object-cover" />
            ))}
          </div>
        ) : null}
        {meta?.tools?.length ? <ToolSteps steps={meta.tools} /> : null}
        {(content || isStreaming) && (
          <div
            className={`inline-block rounded-2xl px-4 py-3 text-left text-sm leading-relaxed ${
              isUser
                ? 'whitespace-pre-wrap rounded-br-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/30'
                : 'glass-deep rounded-bl-md text-slate-200'
            } ${isStreaming ? 'stream-caret' : ''}`}
          >
            {isUser ? (
              content
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
                {content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {isUser && !message.previews?.length && meta?.images ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
            <ImageIcon className="h-3 w-3" /> {meta.images} image{meta.images === 1 ? '' : 's'} attached
          </p>
        ) : null}

        {meta?.actions?.map((a, i) => <ActionCard key={i} action={a} />)}
        {meta?.tasks?.map((t) => <TaskChip key={t.id} task={t} />)}
        {meta?.notice && <p className="mt-1 text-[11px] italic text-slate-500">{meta.notice}</p>}

        {!isStreaming && message.content && (
          <div
            className={`mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${isUser ? 'justify-end' : ''}`}
          >
            {isUser ? (
              onEdit && (
                <button className="btn-icon !p-1" onClick={onEdit} title="Edit and resend" aria-label="Edit and resend this message">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )
            ) : (
              <>
                <CopyButton text={stripCitations(message.content)} />
                <SpeakButton text={message.content} lang={voiceLang} />
                {onRegenerate && (
                  <button className="btn-icon !p-1" onClick={onRegenerate} title="Regenerate" aria-label="Regenerate this reply">
                    <RefreshCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                {meta?.trace && <TraceToggle trace={meta.trace} onOpenSource={onOpenSource} />}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function sourceIcon(s: MemorySource) {
  return s.kind === 'fact' ? Database : s.kind === 'doc' ? FileText : Waypoints;
}

function sourceTitle(s: MemorySource): string {
  switch (s.kind) {
    case 'fact':
      return s.formerly ? 'A fact that is no longer true' : 'Something SABA knows about you';
    case 'moment':
      return `From “${s.title}” · ${new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    case 'summary':
      return 'From a past conversation summary';
    case 'doc':
      return `From ${s.name}${s.page ? ` · p.${s.page}` : ''}`;
  }
}

/** [M2] → a small chip; click shows where SABA got it and can jump to the source conversation. */
function CitationChip({ source, onOpenSource }: { source: MemorySource; onOpenSource: Props['onOpenSource'] }) {
  const [open, setOpen] = useState(false);
  const Icon = sourceIcon(source);
  const conversationId = source.kind === 'doc' ? null : source.conversationId;
  const messageId = source.kind === 'fact' || source.kind === 'moment' || source.kind === 'summary' ? source.messageId : null;
  return (
    <span className="relative inline-block align-baseline">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mx-0.5 inline-flex items-center gap-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-1 text-[10px] font-semibold leading-4 text-violet-300 transition hover:bg-violet-500/20"
        aria-expanded={open}
        aria-label={`Source ${source.ref}: ${source.content}`}
      >
        <Icon className="h-2.5 w-2.5" aria-hidden />
        {source.ref}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-64 rounded-xl border border-edge bg-surface p-3 text-left text-[11px] leading-relaxed text-slate-300 shadow-2xl">
          <span className="mb-1 block font-semibold text-slate-400">{sourceTitle(source)}</span>
          <span className="block">{source.content.length > 260 ? `${source.content.slice(0, 260)}…` : source.content}</span>
          {conversationId && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenSource(conversationId, messageId);
              }}
              className="mt-2 inline-flex items-center gap-1 font-semibold text-violet-300 hover:text-violet-200"
            >
              Open the conversation <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </span>
      )}
    </span>
  );
}

function ToolSteps({ steps }: { steps: ToolStep[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {steps.map((s) => (
        <span
          key={s.id}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
            s.status === 'error' ? 'border-red-500/30 text-red-300' : 'border-edge text-slate-400'
          }`}
        >
          {s.status === 'running' ? (
            <Loader2 className="h-3 w-3 animate-spin text-violet-300" />
          ) : s.status === 'done' ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {s.label}
          {s.summary && <span className="max-w-[12rem] truncate text-slate-500">· {s.summary}</span>}
        </span>
      ))}
    </div>
  );
}

const ACTION_ICON: Record<DeepLinkAction['type'], typeof Music> = {
  spotify: Music,
  youtube: Youtube,
  maps: MapPin,
  directions: Navigation,
  search: Search,
  wikipedia: BookOpen,
  mail: Mail,
  whatsapp: MessageCircle,
  sms: MessageCircle,
  call: Phone,
};

/** Clickable deep-link card — the reliable path when the popup blocker eats the auto-open. */
function ActionCard({ action }: { action: DeepLinkAction }) {
  const Icon = ACTION_ICON[action.type] ?? ExternalLink;
  const url = actionUrl(action);
  return (
    <a
      href={url}
      {...(isWebLink(url) && { target: '_blank', rel: 'noreferrer noopener' })}
      className="glass-deep group/action mt-2 flex max-w-xs items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-wash/[0.08]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/30 to-cyan-500/30">
        <Icon className="h-4 w-4 text-violet-200" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-100">{actionLabel(action)}</p>
        <p className="truncate text-[11px] text-slate-500">{actionDetail(action)}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-hover/action:text-violet-300" />
    </a>
  );
}

function TaskChip({ task }: { task: Task }) {
  const gcal = !task.completedAt && googleCalendarUrl(task);
  return (
    <div className="glass mt-2 flex max-w-sm flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-slate-300">
      {task.completedAt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Bell className="h-3.5 w-3.5 text-violet-300" />}
      <span className="min-w-0 flex-1">
        {task.completedAt ? 'Completed: ' : task.dueAt ? 'Reminder: ' : 'Task added: '}
        <span className="text-slate-100">{task.content}</span>
        {task.dueAt && !task.completedAt && (
          <span className="text-slate-500">
            {' '}
            · {new Date(task.dueAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}
          </span>
        )}
      </span>
      {gcal && (
        <span className="flex gap-1">
          <a href={gcal} target="_blank" rel="noreferrer" className="btn-icon !p-1" title="Add to Google Calendar" aria-label="Add to Google Calendar">
            <CalendarPlus className="h-3.5 w-3.5" />
          </a>
          <button onClick={() => downloadIcs(task)} className="btn-icon !p-1" title="Download .ics" aria-label="Download calendar file">
            <Download className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-icon !p-1"
      title="Copy"
      aria-label="Copy message"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked (insecure context) — nothing useful to show
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Markdown and citations read badly aloud — speak plain sentences. */
function speakable(markdown: string): string {
  return stripCitations(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function SpeakButton({ text, lang }: { text: string; lang: string }) {
  const [speaking, setSpeaking] = useState(false);
  // ponytail: browser speechSynthesis — free, no API. Hidden if unsupported.
  if (typeof window !== 'undefined' && !('speechSynthesis' in window)) return null;
  return (
    <button
      className="btn-icon !p-1"
      title={speaking ? 'Stop' : 'Read aloud'}
      aria-label={speaking ? 'Stop reading' : 'Read message aloud'}
      onClick={() => {
        if (speaking) {
          window.speechSynthesis.cancel();
          setSpeaking(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(speakable(text));
        utterance.lang = lang;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setSpeaking(true);
      }}
    >
      {speaking ? <VolumeX className="h-3.5 w-3.5 text-violet-300" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}

/** The expandable "what did SABA recall for this reply" chip. */
function TraceToggle({ trace, onOpenSource }: { trace: MemoryTrace; onOpenSource: Props['onOpenSource'] }) {
  const [open, setOpen] = useState(false);
  const facts = trace.sources.filter((s) => s.kind === 'fact');
  const moments = trace.sources.filter((s) => s.kind !== 'fact');
  const total = trace.workingMemory + trace.sources.length;
  return (
    <div className="inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`btn-icon !p-1 ${open ? '!text-violet-300' : ''}`}
        title="Memory trace — what SABA recalled for this reply"
        aria-label="Toggle memory trace"
        aria-expanded={open}
      >
        <BrainCircuit className="h-3.5 w-3.5" />
        <span className="ml-1 text-[10px] font-medium">{total}</span>
      </button>
      {open && (
        <div className="mt-2 w-72 rounded-xl border border-edge bg-surface p-3 text-left text-[11px] leading-relaxed shadow-xl sm:w-96">
          <TraceRow icon={Zap} color="text-cyan-300" label={`Working memory — ${trace.workingMemory} recent message${trace.workingMemory === 1 ? '' : 's'} in context`} />
          <TraceRow
            icon={Database}
            color="text-violet-300"
            label={facts.length ? `Facts recalled (${facts.length}):` : 'Facts recalled: none yet'}
            items={facts}
            onOpenSource={onOpenSource}
          />
          <TraceRow
            icon={Waypoints}
            color="text-fuchsia-300"
            label={moments.length ? `Past moments & documents (${moments.length}):` : 'Similar past moments: none found'}
            items={moments}
            onOpenSource={onOpenSource}
          />
        </div>
      )}
    </div>
  );
}

function TraceRow({
  icon: Icon,
  color,
  label,
  items,
  onOpenSource,
}: {
  icon: typeof Zap;
  color: string;
  label: string;
  items?: MemorySource[];
  onOpenSource?: Props['onOpenSource'];
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center gap-1.5 text-slate-300">
        <Icon className={`h-3 w-3 shrink-0 ${color}`} />
        <span>{label}</span>
      </div>
      {items && items.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-[18px] text-slate-500">
          {items.slice(0, 8).map((s) => {
            const conversationId = s.kind === 'doc' ? null : s.conversationId;
            const text = `${s.ref} · ${s.content}${'score' in s ? ` · ${Math.round(s.score * 100)}%` : ''}${s.kind === 'fact' && s.formerly ? ' (no longer true)' : ''}`;
            return (
              <li key={s.ref} className="truncate" title={text}>
                {conversationId && onOpenSource ? (
                  <button
                    onClick={() => onOpenSource(conversationId, 'messageId' in s ? s.messageId : null)}
                    className="max-w-full truncate text-left hover:text-slate-300"
                  >
                    {text}
                  </button>
                ) : (
                  text
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500" aria-hidden>
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="glass flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3">
        <span className="text-shimmer text-xs font-medium">Recalling memories…</span>
      </div>
    </div>
  );
}
