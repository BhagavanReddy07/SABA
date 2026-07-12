'use client';

import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, ChevronDown, Sparkles } from 'lucide-react';
import type { Message, MemoryTrace } from '@/lib/types';

export function Messages({ messages, thinking }: { messages: Message[]; thinking: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, thinking]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {thinking && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`animate-fade-up flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-sm leading-relaxed ${
            isUser
              ? 'rounded-br-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
              : 'glass rounded-bl-md text-slate-200'
          }`}
        >
          {message.content}
        </div>
        {!isUser && message.memoryTrace && <TraceChip trace={message.memoryTrace} />}
      </div>
    </div>
  );
}

/** Shows what the assistant recalled to write this reply — the 3 tiers, visible. */
function TraceChip({ trace }: { trace: MemoryTrace }) {
  const [open, setOpen] = useState(false);
  const recalled =
    trace.workingMemory + trace.episodic.length + trace.semantic.length;
  if (recalled === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-500 transition hover:text-slate-300"
      >
        <BrainCircuit className="h-3 w-3 text-violet-400" />
        {trace.workingMemory} in window · {trace.episodic.length} facts ·{' '}
        {trace.semantic.length} recalled
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="glass mt-2 space-y-3 rounded-xl p-3 text-left text-xs">
          <div>
            <p className="mb-1 font-semibold text-cyan-300">Tier 1 · Working memory (Redis)</p>
            <p className="text-slate-400">
              {trace.workingMemory} recent message{trace.workingMemory === 1 ? '' : 's'} in the
              conversation window.
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-violet-300">Tier 2 · Episodic facts (Postgres)</p>
            {trace.episodic.length === 0 ? (
              <p className="text-slate-500">Nothing learned yet.</p>
            ) : (
              <ul className="space-y-0.5 text-slate-400">
                {trace.episodic.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 font-semibold text-fuchsia-300">Tier 3 · Semantic recall (Pinecone)</p>
            {trace.semantic.length === 0 ? (
              <p className="text-slate-500">No similar past moments found.</p>
            ) : (
              <ul className="space-y-0.5 text-slate-400">
                {trace.semantic.map((s, i) => (
                  <li key={i}>
                    • “{s.content}”{' '}
                    <span className="text-slate-600">({Math.round(s.score * 100)}%)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
      <div className="glass flex items-center gap-1 rounded-2xl rounded-bl-md px-4 py-3.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="typing-dot h-1.5 w-1.5 rounded-full bg-violet-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
