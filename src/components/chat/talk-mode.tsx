'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { stripCitations } from '@/lib/citations';

// Minimal typing for the (webkit-prefixed) Web Speech API — the composer's shape plus abort and error codes.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LABEL = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' };
type Phase = keyof typeof LABEL;

const SILENCE_MS = 1200; // a pause this long ends the user's turn
const MIC_GAIN = 8; // speech RMS is ~0.05–0.15, so this fills the orb; raise it for quiet mics
const ORB = 240; // canvas size, CSS px

/** Reply markdown → plain words worth saying (and showing). */
// ponytail: code blocks are read like prose; skip ``` fences if voice replies ever get code-heavy.
function speakable(text: string): string {
  return stripCitations(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/(?:https?:\/\/|www\.)\S+/g, '') // nobody wants a URL read out
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

/**
 * Speakers leak the reply back into the mic. A result made mostly of the reply's own words is SABA
 * hearing itself, not the user barging in. Empty results count as echo too, so noise never interrupts.
 * ponytail: word-overlap heuristic; true echo cancellation needs our own audio pipeline instead of Web Speech.
 */
function isEcho(heard: string, reply: string): boolean {
  const said = new Set(words(reply));
  const got = words(heard);
  return got.filter((w) => said.has(w)).length >= got.length * 0.6;
}

/** Violet→fuchsia→cyan sphere with a soft halo; `level` (0–1) swells both. */
function drawOrb(ctx: CanvasRenderingContext2D, level: number) {
  const c = ORB / 2;
  const r = ORB * (0.26 + 0.16 * level);
  ctx.clearRect(0, 0, ORB, ORB);
  const halo = ctx.createRadialGradient(c, c, r * 0.7, c, c, c);
  halo.addColorStop(0, `rgba(192, 38, 211, ${0.25 + 0.35 * level})`);
  halo.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, ORB, ORB);
  const core = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.1, c, c, r);
  core.addColorStop(0, '#8b5cf6');
  core.addColorStop(0.6, '#d946ef');
  core.addColorStop(1, '#22d3ee');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Sends a user message exactly as if typed. */
  onSend: (text: string) => void;
  /** The assistant reply text as it streams in ('' until the first token). */
  liveReply: string;
  /** True while a reply is being generated. */
  streaming: boolean;
  /** BCP-47 language for both recognition and speech, e.g. 'en-IN', 'te-IN'. */
  lang: string;
};

/** Hands-free voice conversation: listen → send → speak the streamed reply → listen again. */
export function TalkMode(props: Props) {
  // Mounted only while open (and per language), so closing tears the whole session down.
  return props.open ? <TalkSession key={props.lang} {...props} /> : null;
}

function TalkSession({ onClose, onSend, liveReply, streaming, lang }: Props) {
  const [caption, setCaption] = useState(''); // what the user is saying, or last said
  const [speaking, setSpeaking] = useState(false);
  const [dropped, setDropped] = useState(false); // user barged in: say no more of this reply
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Utterances queued or playing. Holding them also stops Chrome garbage-collecting one mid-speech,
  // which silently drops its onend.
  const queueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const queuedRef = useRef(0); // chars of the reply already handed to the synthesizer
  const replyRef = useRef('');
  const streamingRef = useRef(false);
  const mutedRef = useRef(false);
  const phaseRef = useRef<Phase>('listening');
  const onSendRef = useRef(onSend);

  const phase: Phase = speaking ? 'speaking' : streaming && !dropped ? 'thinking' : 'listening';

  // Latest values for the long-lived recognition handlers and draw loop.
  useEffect(() => {
    phaseRef.current = phase;
    onSendRef.current = onSend;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The session: recognition that keeps restarting while open (unless muted), plus the mic-reactive orb.
  useEffect(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    window.speechSynthesis.cancel(); // start from silence (e.g. a read-aloud still playing)

    let closed = false;
    let finals = ''; // the utterance so far
    let interim = '';
    let echoUntil = 0; // results below this index were SABA's own voice
    let silence: ReturnType<typeof setTimeout> | undefined;
    let restart: ReturnType<typeof setTimeout> | undefined;

    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    recRef.current = rec;
    const listen = () => {
      if (closed || mutedRef.current) return;
      try {
        rec.start();
      } catch {
        // already running
      }
    };

    const flush = () => {
      // The chat sends one message at a time: wait out a reply still streaming or being spoken.
      if (streamingRef.current || queueRef.current.length) {
        silence = setTimeout(flush, 300);
        return;
      }
      const text = `${finals} ${interim}`.replace(/\s+/g, ' ').trim();
      finals = interim = '';
      if (!text) return;
      rec.abort(); // discard late results for what we just sent; onend restarts listening
      setDropped(false);
      onSendRef.current(text);
    };

    rec.onresult = (event) => {
      interim = '';
      for (let i = Math.max(event.resultIndex, echoUntil); i < event.results.length; i++) {
        const { transcript } = event.results[i][0];
        if (queueRef.current.length) {
          if (isEcho(transcript, replyRef.current)) {
            echoUntil = i + 1;
            continue;
          }
          // Barge-in: the user is talking over the reply, so stop it and drop the rest.
          queueRef.current = [];
          window.speechSynthesis.cancel();
          setSpeaking(false);
          setDropped(true);
        }
        if (event.results[i].isFinal) finals += ` ${transcript}`;
        else interim += ` ${transcript}`;
      }
      const heard = `${finals} ${interim}`.replace(/\s+/g, ' ').trim();
      clearTimeout(silence);
      if (!heard) return;
      setCaption(heard);
      silence = setTimeout(flush, SILENCE_MS);
    };
    rec.onerror = (event) => {
      // A denied or missing mic won't fix itself: stop the restart loop and say so.
      if (/not-allowed|audio-capture/.test(event.error)) {
        rec.onend = null;
        setBlocked(true);
      }
    };
    rec.onend = () => {
      echoUntil = 0; // result indices restart with each recognition session
      restart = setTimeout(listen, 150); // browsers end sessions on silence and timeouts
    };
    listen();

    let raf = 0;
    let stream: MediaStream | undefined;
    let audio: AudioContext | undefined;
    let analyser: AnalyserNode | undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.height = ORB * dpr;
      ctx.scale(dpr, dpr);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) drawOrb(ctx, 0.3);
      else {
        // This stream only drives the orb; recognition captures the mic on its own.
        navigator.mediaDevices
          ?.getUserMedia({ audio: true })
          .then((s) => {
            if (closed) {
              s.getTracks().forEach((t) => t.stop());
              return;
            }
            stream = s;
            audio = new AudioContext();
            analyser = audio.createAnalyser();
            audio.createMediaStreamSource(s).connect(analyser);
          })
          .catch(() => {}); // no mic access: the orb keeps its synthetic pulse
        const samples = new Float32Array(2048);
        let level = 0;
        const frame = (now: number) => {
          const t = now / 1000;
          let target = 0.2 + 0.08 * Math.sin(t * 2); // gentle pulse when there's no mic level
          if (phaseRef.current === 'speaking') target = 0.5 + 0.25 * Math.abs(Math.sin(t * 6));
          else if (phaseRef.current === 'thinking') target = 0.3 + 0.15 * Math.sin(t * 1.2);
          else if (mutedRef.current) target = 0;
          else if (analyser) {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const v of samples) sum += v * v;
            target = Math.min(1, Math.sqrt(sum / samples.length) * MIC_GAIN);
          }
          level += (target - level) * 0.15;
          drawOrb(ctx, level);
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      }
    }

    return () => {
      closed = true;
      clearTimeout(silence);
      clearTimeout(restart);
      cancelAnimationFrame(raf);
      rec.onresult = rec.onend = rec.onerror = null;
      rec.abort();
      recRef.current = null;
      queueRef.current = [];
      window.speechSynthesis.cancel();
      stream?.getTracks().forEach((t) => t.stop());
      void audio?.close();
      // Forget the reply too, so a StrictMode remount voices it again from the top.
      streamingRef.current = false;
      setSpeaking(false);
    };
  }, [lang]);

  // Voice the reply as it streams, a sentence at a time.
  useEffect(() => {
    const started = streaming && !streamingRef.current;
    const ended = !streaming && streamingRef.current;
    streamingRef.current = streaming;
    if (started) {
      queuedRef.current = 0;
      replyRef.current = '';
    }
    if (liveReply) replyRef.current = liveReply; // kept in case the caller clears it as the stream completes
    if (dropped || !(streaming || ended)) return;
    const rest = replyRef.current.slice(queuedRef.current);
    // Mid-stream, stop at the last sentence end: a trailing '.' may be the "3." of "3.14".
    const chunk = streaming ? /^[\s\S]*(?:[.!?…।]\s|\n)/.exec(rest)?.[0] : rest;
    if (!chunk) return;
    queuedRef.current += chunk.length;
    for (const sentence of chunk.replace(/([.!?…।])\s+/g, '$1\n').split('\n')) {
      const text = speakable(sentence);
      if (!/[\p{L}\p{N}]/u.test(text)) continue; // rules, table borders, emoji-only lines
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.onend = utterance.onerror = () => {
        const queue = queueRef.current;
        const i = queue.indexOf(utterance);
        if (i < 0) return; // cancelled by a barge-in or close
        queue.splice(i, 1);
        if (queue.length) return;
        setSpeaking(false);
        recRef.current?.abort(); // drop any of our own voice the mic caught; onend restarts listening
      };
      queueRef.current.push(utterance);
      window.speechSynthesis.speak(utterance);
      setSpeaking(true);
    }
  }, [liveReply, streaming, dropped, lang]);

  const toggleMute = () => {
    mutedRef.current = !muted;
    setMuted(!muted);
    if (!muted) recRef.current?.stop();
    else {
      try {
        recRef.current?.start();
      } catch {
        // still winding down; its onend restarts it
      }
    }
  };

  const supported = getSpeechRecognition() !== null;
  const reply = speakable(liveReply);
  const label = blocked ? 'Mic blocked' : muted && phase === 'listening' ? 'Muted' : LABEL[phase];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Talk mode"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-xl"
    >
      <div className="animate-fade-up flex w-full max-w-xl flex-col items-center gap-6 text-center">
        {supported ? (
          <>
            <canvas ref={canvasRef} className="h-[240px] w-[240px]" aria-hidden="true" />
            <p aria-live="polite" className="text-gradient font-display text-2xl font-semibold">
              {label}
            </p>
            <div className="min-h-[6rem] space-y-3">
              {(blocked || caption) && (
                <p className="text-lg text-slate-200">
                  {blocked ? 'Allow microphone access for this site, then reopen talk mode.' : caption}
                </p>
              )}
              {reply && (
                <p className="text-sm leading-relaxed text-slate-400">
                  {reply.length > 200 ? `…${reply.slice(-200)}` : reply}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-slate-300">
            Talk mode needs a browser with speech recognition — try Chrome or Edge.
          </p>
        )}
        <div className="flex gap-3">
          {supported && (
            <button
              onClick={toggleMute}
              className={`btn-ghost !rounded-full !p-3.5 ${muted ? '!text-red-400' : ''}`}
              aria-label="Mute microphone"
              aria-pressed={muted}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="btn-ghost !rounded-full !p-3.5"
            aria-label="End talk mode"
            autoFocus
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
