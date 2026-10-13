'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export type Toast = {
  id: number;
  text: string;
  tone?: 'default' | 'success' | 'error';
  action?: { label: string; run: () => void };
};

/** Toast state for one page: `push` returns the id; toasts with an action stay a little longer. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.action ? 9000 : 5000);
      return id;
    },
    [dismiss]
  );
  return { toasts, push, dismiss };
}

const TONE: Record<NonNullable<Toast['tone']>, string> = {
  default: 'border-edge',
  success: 'border-emerald-500/30',
  error: 'border-red-500/40',
};

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
  }, []);
  return (
    <div
      className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-surface/95 px-4 py-2.5 text-xs text-slate-200 shadow-2xl backdrop-blur-xl transition duration-300 ${TONE[toast.tone ?? 'default']} ${shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
    >
      <span className="min-w-0 flex-1 leading-relaxed">{toast.text}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            onDismiss(toast.id);
          }}
          className="shrink-0 font-semibold text-violet-300 hover:text-violet-200"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={() => onDismiss(toast.id)} className="btn-icon !p-1" aria-label="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
