'use client';

import { useRef, useState } from 'react';
import { SendHorizonal } from 'lucide-react';

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(trimmed);
  };

  return (
    <div className="border-t border-edge bg-ink/80 px-4 py-4 backdrop-blur">
      <div className="glass mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl p-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Message SABA…"
          className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="btn-primary !rounded-xl !p-2.5"
          aria-label="Send message"
        >
          <SendHorizonal className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-600">
        SABA remembers across conversations — try telling it about yourself.
      </p>
    </div>
  );
}
