import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Sparkles } from 'lucide-react';
import { getSharedConversation } from '@/server/db';
import { stripCitations } from '@/lib/citations';
import { verifyToken } from '@/server/tokens';

// Public, read-only view of a conversation its owner chose to share. No memory traces, no tools —
// just the messages. Revoking (shared_at = NULL) turns this into a 404 immediately.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shared conversation — SABA', robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SharedConversationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyToken<{ p?: unknown; cid?: unknown }>(decodeURIComponent(token));
  if (!payload || payload.p !== 'sh' || typeof payload.cid !== 'string' || !UUID.test(payload.cid)) notFound();
  const shared = await getSharedConversation(payload.cid);
  if (!shared) notFound();
  const first = shared.owner.split(' ')[0];

  return (
    <div className="relative min-h-screen">
      <div className="aurora" />
      <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <span className="text-gradient">SABA</span>
        </Link>
        <Link href="/login" className="btn-primary !px-4 !py-2 text-xs">
          Try SABA free
        </Link>
      </header>
      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-20">
        <h1 className="font-display text-2xl font-bold text-slate-100">{shared.conversation.title}</h1>
        <p className="mt-1 text-xs text-slate-500">
          Shared by {first} · {new Date(shared.conversation.updatedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
        </p>
        <div className="mt-8 space-y-6">
          {shared.messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'whitespace-pre-wrap bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                    : 'glass-deep text-slate-200'
                }`}
              >
                {m.role === 'user' ? (
                  m.content
                ) : (
                  <div className="prose-saba">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{stripCitations(m.content)}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-12 text-center text-xs text-slate-600">
          SABA is a personal AI assistant that remembers you across conversations.{' '}
          <Link href="/" className="text-violet-300 hover:underline">
            Learn more
          </Link>
        </p>
      </main>
    </div>
  );
}
