'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, Paperclip, Pencil, SendHorizonal, Square, X } from 'lucide-react';
import type { MessageImage } from '@/lib/types';

// Minimal typing for the (webkit-prefixed) Web Speech API — free, on-device/browser.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type Attachment = MessageImage & { preview: string };

const MAX_IMAGES = 3;
const MAX_SIDE = 1280;
const DOC_ACCEPT = '.pdf,.txt,.md,.markdown,.csv,.json,application/pdf,text/plain,text/markdown';

/** Downscales a photo to ≤1280px JPEG so uploads stay small and fast. */
async function toAttachment(file: File): Promise<Attachment> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unreadable image'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL('image/jpeg', 0.85);
    return { mimeType: 'image/jpeg', data: preview.split(',')[1], preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Props = {
  onSend: (text: string, attachments: Attachment[]) => void;
  /** A reply is being generated — the send button becomes Stop. */
  streaming: boolean;
  onStop: () => void;
  /** 'hero' renders the large centered box for the empty state. */
  variant?: 'bottom' | 'hero';
  /** Text to put in the box (Pulse cards, email links, edit). `nonce` re-applies the same text. */
  prefill?: { text: string; nonce: number } | null;
  /** Editing the last message: shows a banner; sending replaces that turn. */
  editing?: boolean;
  onCancelEdit?: () => void;
  voiceLang: string;
  onTalk?: () => void;
  /** Images are only sent when a vision model is configured. */
  allowImages: boolean;
  onUploadDocument: (file: File) => void;
  /** Shown under the box (incognito toggle, etc.). */
  footer?: React.ReactNode;
};

export function Composer({
  onSend,
  streaming,
  onStop,
  variant = 'bottom',
  prefill,
  editing,
  onCancelEdit,
  voiceLang,
  onTalk,
  allowImages,
  onUploadDocument,
  footer,
}: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognition()));
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prefill.text.length, prefill.text.length);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    });
  }, [prefill]);

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        if (!allowImages) continue;
        try {
          const attachment = await toAttachment(file);
          setAttachments((prev) => (prev.length < MAX_IMAGES ? [...prev, attachment] : prev));
        } catch {
          // unreadable image — skip it
        }
      } else {
        onUploadDocument(file);
      }
    }
  };

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = voiceLang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      if (transcript) setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachments.length) || streaming) return;
    recognitionRef.current?.stop();
    setListening(false);
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(trimmed, attachments);
  };

  const hero = variant === 'hero';

  const box = (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void addFiles(Array.from(e.dataTransfer.files));
      }}
      className={`glass-deep mx-auto w-full transition-shadow focus-within:shadow-[0_0_0_1px_rgba(139,92,246,0.4),0_8px_40px_-12px_rgba(139,92,246,0.35)] ${
        hero ? 'max-w-2xl rounded-3xl p-3' : 'max-w-3xl rounded-2xl p-2'
      } ${listening ? 'shadow-[0_0_0_1px_rgba(239,68,68,0.5)]' : ''} ${dragging ? 'shadow-[0_0_0_2px_rgba(139,92,246,0.6)]' : ''}`}
    >
      {editing && (
        <div className="mb-1 flex items-center gap-2 px-3 pt-1 text-[11px] text-violet-300">
          <Pencil className="h-3 w-3" /> Editing your last message
          <button onClick={onCancelEdit} className="ml-auto text-slate-500 hover:text-slate-300">
            Cancel
          </button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2 pt-1">
          {attachments.map((a, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              <img src={a.preview} alt={`Attachment ${i + 1}`} className="h-16 w-16 rounded-lg border border-edge object-cover" />
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 text-slate-400 shadow hover:text-slate-100"
                aria-label={`Remove attachment ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Hero on phones: full-width box with the buttons on a row beneath it. */}
      <div className={`flex items-end gap-1.5 ${hero ? 'flex-wrap justify-end' : ''}`}>
        <textarea
          ref={textareaRef}
          value={text}
          autoFocus={hero}
          aria-label="Message SABA"
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (files.length) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape' && editing) onCancelEdit?.();
          }}
          rows={hero ? 2 : 1}
          placeholder={
            listening ? 'Listening… speak now' : hero ? 'Ask me anything — I remember everything you tell me' : 'Message SABA…'
          }
          className={`max-h-40 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 ${hero ? 'basis-full text-base sm:basis-0' : 'text-sm'}`}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept={`${allowImages ? 'image/*,' : ''}${DOC_ACCEPT}`}
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="btn-icon !p-2.5"
          aria-label={allowImages ? 'Attach an image or document' : 'Add a document to memory'}
          title={allowImages ? 'Attach images (sent to SABA) or PDFs/notes (saved to memory)' : 'Add a PDF or notes to memory'}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        {speechSupported && (
          <button
            onClick={toggleMic}
            className={`btn-icon !p-2.5 ${listening ? '!text-red-400' : ''}`}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            title={listening ? 'Stop voice input' : 'Speak instead of typing'}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        {speechSupported && onTalk && (
          <button onClick={onTalk} className="btn-icon !p-2.5" aria-label="Start Talk mode" title="Talk mode — a hands-free conversation">
            <AudioLines className="h-4 w-4" />
          </button>
        )}
        {streaming ? (
          <button onClick={onStop} className="btn-ghost !rounded-xl !p-2.5" aria-label="Stop generating" title="Stop">
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() && !attachments.length}
            className="btn-primary !rounded-xl !p-2.5"
            aria-label="Send message"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  if (hero) {
    return (
      <>
        {box}
        {footer}
      </>
    );
  }

  return (
    <div className="border-t border-edge bg-ink/60 px-4 py-4 backdrop-blur-md">
      {box}
      {footer ?? (
        <p className="mt-2 text-center text-[11px] text-slate-600">
          SABA remembers across conversations — drop a PDF here to add it to memory.
        </p>
      )}
    </div>
  );
}
