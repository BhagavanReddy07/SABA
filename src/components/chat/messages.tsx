'use client';

import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Components } from 'react-markdown';
import type { Message } from '@/lib/types';

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
          className={`inline-block rounded-2xl px-4 py-3 text-left text-sm leading-relaxed ${
            isUser
              ? 'rounded-br-md whitespace-pre-wrap bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
              : 'glass rounded-bl-md text-slate-200'
          }`}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MARKDOWN_COMPONENTS}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
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
