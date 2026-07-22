'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, SendHorizonal } from 'lucide-react';

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

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function Composer({
  onSend,
  disabled,
  variant = 'bottom',
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  /** 'hero' renders the large centered box for the empty state (Claude-style). */
  variant?: 'bottom' | 'hero';
}) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognition()));
    return () => recognitionRef.current?.stop();
  }, []);

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
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
    if (!trimmed || disabled) return;
    recognitionRef.current?.stop();
    setListening(false);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(trimmed);
  };

  const hero = variant === 'hero';

  const box = (
    <div
      className={`glass-deep mx-auto flex w-full items-end gap-1.5 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(139,92,246,0.4),0_8px_40px_-12px_rgba(139,92,246,0.35)] ${
        hero ? 'max-w-2xl rounded-3xl p-3' : 'max-w-3xl rounded-2xl p-2'
      } ${listening ? 'shadow-[0_0_0_1px_rgba(239,68,68,0.5)]' : ''}`}
    >
      <textarea
        ref={textareaRef}
        value={text}
        autoFocus={hero}
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
        rows={hero ? 2 : 1}
        placeholder={
          listening
            ? 'Listening… speak now'
            : hero
              ? 'Ask me anything — I remember everything you tell me'
              : 'Message SABA…'
        }
        className={`max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none ${hero ? 'text-base' : 'text-sm'}`}
      />
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
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        className="btn-primary !rounded-xl !p-2.5"
        aria-label="Send message"
      >
        <SendHorizonal className="h-4 w-4" />
      </button>
    </div>
  );

  if (hero) return box;

  return (
    <div className="border-t border-edge bg-ink/60 px-4 py-4 backdrop-blur-md">
      {box}
      <p className="mt-2 text-center text-[11px] text-slate-600">
        SABA remembers across conversations — try telling it about yourself.
      </p>
    </div>
  );
}
