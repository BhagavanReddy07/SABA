'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  Check,
  Copy,
  Database,
  ExternalLink,
  Mail,
  MapPin,
  Music,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  Waypoints,
  Youtube,
  Zap,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Components } from 'react-markdown';
import type { ChatAction, Message, MemoryTrace } from '@/lib/types';
import { actionLabel, actionUrl } from '@/lib/actions';

export function Messages({
  messages,
  thinking,
  streamingId,
}: {
  messages: Message[];
  thinking: boolean;
  streamingId: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, thinking, lastContent]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} isStreaming={m.id === streamingId} />
      ))}
      {thinking && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-slate-100" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: ({ node, ...props }) => <li {...props} />,
  a: ({ node, ...props }) => (
    <a className="text-violet-300 underline hover:text-violet-200" target="_blank" rel="noreferrer" {...props} />
  ),
  code: ({ node, className, ...props }) =>
    className?.includes('language-') ? (
      <code className="mb-2 block overflow-x-auto rounded-lg bg-wash/[0.08] p-3 text-xs last:mb-0" {...props} />
    ) : (
      <code className="rounded bg-wash/[0.12] px-1 py-0.5 text-[0.85em]" {...props} />
    ),
  h1: ({ node, ...props }) => <h3 className="mb-1 mt-2 text-base font-semibold first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h3 className="mb-1 mt-2 text-base font-semibold first:mt-0" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props} />,
};

function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming: boolean;
}) {
  const isUser = message.role === 'user';
  // Hide a trailing action tag while it streams in (the server strips it from the final message).
  const content = isStreaming
    ? message.content.replace(/\[?\[?action:[\s\S]*$/, '').replace(/\[+$/, '')
    : message.content;
  return (
    <div className={`animate-fade-up flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 shadow-md shadow-violet-900/40 ${isStreaming ? 'animate-pulse-glow' : ''}`}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}
      <div className={`group max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block rounded-2xl px-4 py-3 text-left text-sm leading-relaxed ${
            isUser
              ? 'rounded-br-md whitespace-pre-wrap bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/30'
              : 'glass-deep rounded-bl-md text-slate-200'
          } ${isStreaming ? 'stream-caret' : ''}`}
        >
          {isUser ? (
            content
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MARKDOWN_COMPONENTS}>
              {content}
            </ReactMarkdown>
          )}
        </div>

        {message.action && <ActionCard action={message.action} />}

        {!isUser && !isStreaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <CopyButton text={message.content} />
            <SpeakButton text={message.content} />
            {message.memoryTrace && <TraceToggle trace={message.memoryTrace} />}
          </div>
        )}
      </div>
    </div>
  );
}

const ACTION_ICON: Record<ChatAction['type'], typeof Music> = {
  spotify: Music,
  youtube: Youtube,
  maps: MapPin,
  search: Search,
  mail: Mail,
};

/** Clickable deep-link card — the reliable path when the popup blocker eats the auto-open. */
function ActionCard({ action }: { action: ChatAction }) {
  const Icon = ACTION_ICON[action.type];
  const detail =
    action.type === 'mail'
      ? action.subject ?? action.to ?? 'New email'
      : action.query;
  return (
    <a
      href={actionUrl(action)}
      target="_blank"
      rel="noreferrer noopener"
      className="glass-deep group/action mt-2 flex max-w-xs items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-wash/[0.08]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/30 to-cyan-500/30">
        <Icon className="h-4 w-4 text-violet-200" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-100">{actionLabel(action)}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-hover/action:text-violet-300" />
    </a>
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
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function SpeakButton({ text }: { text: string }) {
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
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setSpeaking(true);
      }}
    >
      {speaking ? (
        <VolumeX className="h-3.5 w-3.5 text-violet-300" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/** The expandable "what did SABA recall for this reply" chip. */
function TraceToggle({ trace }: { trace: MemoryTrace }) {
  const [open, setOpen] = useState(false);
  const total = trace.workingMemory + trace.episodic.length + trace.semantic.length;
  return (
    <div className="inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`btn-icon !p-1 ${open ? '!text-violet-300' : ''}`}
        title="Memory trace — what SABA recalled for this reply"
        aria-label="Toggle memory trace"
      >
        <BrainCircuit className="h-3.5 w-3.5" />
        <span className="ml-1 text-[10px] font-medium">{total}</span>
      </button>
      {open && (
        <div className="glass-deep mt-2 w-72 rounded-xl p-3 text-left text-[11px] leading-relaxed sm:w-80">
          <TraceRow
            icon={Zap}
            color="text-cyan-300"
            label={`Working memory — ${trace.workingMemory} recent message${trace.workingMemory === 1 ? '' : 's'} in context`}
          />
          <TraceRow
            icon={Database}
            color="text-violet-300"
            label={
              trace.episodic.length > 0
                ? `Facts recalled (${trace.episodic.length}):`
                : 'Facts recalled: none yet'
            }
            items={trace.episodic}
          />
          <TraceRow
            icon={Waypoints}
            color="text-fuchsia-300"
            label={
              trace.semantic.length > 0
                ? `Similar past moments (${trace.semantic.length}):`
                : 'Similar past moments: none found'
            }
            items={trace.semantic.map((s) => `${s.content} · ${Math.round(s.score * 100)}%`)}
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
}: {
  icon: typeof Zap;
  color: string;
  label: string;
  items?: string[];
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center gap-1.5 text-slate-300">
        <Icon className={`h-3 w-3 shrink-0 ${color}`} />
        <span>{label}</span>
      </div>
      {items && items.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-[18px] text-slate-500">
          {items.slice(0, 5).map((item, i) => (
            <li key={i} className="truncate" title={item}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="glass flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3">
        <span className="text-shimmer text-xs font-medium">Recalling memories…</span>
      </div>
    </div>
  );
}
