// SABA Anywhere — Telegram. Same brain (chatStream), same memory; replies stream by editing one
// message, and reminders arrive with inline Done / Snooze buttons.
// Setup: TELEGRAM_BOT_TOKEN, then open /api/telegram/setup?key=<CRON_SECRET> once.

import type { DueTask } from './db';
import {
  completeTaskById,
  consumeTelegramLinkCode,
  getTaskOwner,
  getUserByTelegramChat,
  hitRateLimit,
  setTelegramConversation,
  snoozeTaskById,
} from './db';
import { chatStream } from './assistant';
import { actionLabel, actionUrl } from '@/lib/actions';
import { stripCitations } from '@/lib/citations';
import { formatDue } from './email';
import { hmac } from './tokens';

export const hasTelegram = (): boolean => Boolean(process.env.TELEGRAM_BOT_TOKEN);

/** Telegram echoes this in X-Telegram-Bot-Api-Secret-Token on every webhook call. */
export const webhookSecret = (): string => hmac('telegram-webhook').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description ?? res.status}`);
  return data.result;
}

const cache = globalThis as unknown as { sabaBotName?: string };

export async function botUsername(): Promise<string | null> {
  if (!hasTelegram()) return null;
  if (!cache.sabaBotName) cache.sabaBotName = (await tg('getMe', {})).username;
  return cache.sabaBotName ?? null;
}

export function setWebhook(url: string): Promise<unknown> {
  return tg('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message', 'callback_query'] });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Markdown → the small HTML subset Telegram accepts (falls back to plain text if rejected). */
export function toTelegramHtml(markdown: string): string {
  const blocks: string[] = [];
  let out = esc(stripCitations(markdown)).replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre>${code.trimEnd()}</pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  out = out
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/gm, '$1<i>$2</i>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => `<a href="${url.replace(/"/g, '&quot;')}">${label}</a>`);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}

async function send(chatId: string, text: string, buttons?: { text: string; data: string }[][]): Promise<number | null> {
  const markup = buttons && { reply_markup: { inline_keyboard: buttons.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) } };
  try {
    return (await tg('sendMessage', { chat_id: chatId, text: toTelegramHtml(text), parse_mode: 'HTML', ...markup })).message_id;
  } catch {
    try {
      return (await tg('sendMessage', { chat_id: chatId, text: stripCitations(text), ...markup })).message_id;
    } catch (err) {
      console.warn('[telegram] send failed:', (err as Error).message);
      return null;
    }
  }
}

async function edit(chatId: string, messageId: number, text: string, html: boolean): Promise<void> {
  try {
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: html ? toTelegramHtml(text) : stripCitations(text),
      ...(html && { parse_mode: 'HTML' }),
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    if (html) await edit(chatId, messageId, text, false);
    else if (!/not modified/i.test((err as Error).message)) console.warn('[telegram] edit failed:', (err as Error).message);
  }
}

const LIMIT = 3900; // Telegram allows 4096; leave room for HTML tags

export async function sendReminderTelegram(task: DueTask): Promise<boolean> {
  if (!hasTelegram() || !task.telegramChatId) return false;
  const due = task.dueAt ? `\n🗓 ${formatDue(task.dueAt, task.userTimezone)}` : '';
  return (
    (await send(task.telegramChatId, `⏰ **Reminder:** ${task.content}${due}`, [
      [
        { text: '✓ Done', data: `t:${task.id}:c` },
        { text: '💤 Snooze 15 min', data: `t:${task.id}:s` },
      ],
    ])) !== null
  );
}

export async function sendTelegramText(chatId: string, markdown: string): Promise<boolean> {
  return hasTelegram() && (await send(chatId, markdown)) !== null;
}

/** Handles one webhook update. Runs after the 200 response, so it may take as long as a reply needs. */
export async function handleUpdate(update: any): Promise<void> {
  if (update?.callback_query) return handleCallback(update.callback_query);
  const msg = update?.message;
  if (!msg?.chat?.id) return;
  const chatId = String(msg.chat.id);
  const text: string = (msg.text ?? msg.caption ?? '').trim();

  if (msg.chat.type !== 'private') {
    await send(chatId, 'I only chat in private messages.');
    return;
  }
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1];
    if (code) {
      const user = await consumeTelegramLinkCode(code, chatId);
      await send(
        chatId,
        user
          ? `Linked ✓ Hi ${user.name.split(' ')[0]}! I'm the same SABA — same memory, same reminders. Just talk to me. /new starts a fresh conversation.`
          : 'That link has expired. Open SABA → Settings → Connections → Telegram to get a new one.'
      );
      return;
    }
  }
  const user = await getUserByTelegramChat(chatId);
  if (!user) {
    await send(chatId, 'Hi! Link your SABA account first: SABA → Settings → Connections → Telegram → Connect.');
    return;
  }
  if (text === '/start' || text === '/help') {
    await send(chatId, `You're linked as ${user.name}. Send me anything — I remember across the web app and here. /new starts a fresh conversation.`);
    return;
  }
  if (text === '/new') {
    await setTelegramConversation(user.id, null);
    await send(chatId, 'Started a fresh conversation ✨');
    return;
  }
  if (!text) {
    await send(chatId, 'I can only read text messages here for now.');
    return;
  }
  if ((await hitRateLimit(`tg:${user.id}`, 300)) > 30) {
    await send(chatId, "You're sending messages faster than I can keep up — give me a minute 🙂");
    return;
  }

  await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  let messageId: number | null = null;
  let reply = '';
  let lastEdit = 0;
  for await (const event of chatStream({
    user,
    message: text.slice(0, 8000),
    conversationId: user.telegramConversationId ?? undefined,
    channel: 'telegram',
  })) {
    if (event.type === 'start' && event.conversation.id !== user.telegramConversationId) {
      await setTelegramConversation(user.id, event.conversation.id);
    } else if (event.type === 'delta') {
      reply += event.text;
      if (reply.trim() && reply.length < LIMIT && Date.now() - lastEdit > 1500) {
        lastEdit = Date.now();
        if (messageId === null) messageId = await send(chatId, reply);
        else await edit(chatId, messageId, reply, false);
      }
    } else if (event.type === 'done') {
      const extras = [
        ...(event.message.meta?.actions ?? []).map((a) => `▶ ${actionLabel(a)}: ${actionUrl(a)}`),
        ...(event.message.meta?.tasks ?? [])
          .filter((t) => !t.completedAt)
          .map((t) => `⏰ ${t.content}${t.dueAt ? ` — ${formatDue(t.dueAt, user.timezone)}` : ''}`),
      ];
      const full = [event.message.content, ...extras].join('\n\n');
      const parts = full.match(new RegExp(`[\\s\\S]{1,${LIMIT}}`, 'g')) ?? [full];
      if (messageId === null) messageId = await send(chatId, parts[0]);
      else await edit(chatId, messageId, parts[0], true);
      for (const part of parts.slice(1)) await send(chatId, part);
    }
  }
}

async function handleCallback(query: any): Promise<void> {
  const answer = (text: string) => tg('answerCallbackQuery', { callback_query_id: query.id, text }).catch(() => {});
  const match = /^t:([0-9a-f-]{36}):([cs])$/.exec(query.data ?? '');
  const chatId = query.message?.chat?.id ? String(query.message.chat.id) : null;
  if (!match || !chatId) return void (await answer('Unknown action'));
  const user = await getUserByTelegramChat(chatId);
  if (!user || (await getTaskOwner(match[1])) !== user.id) return void (await answer('That task is not yours.'));

  const task = match[2] === 'c' ? await completeTaskById(match[1]) : await snoozeTaskById(match[1], 15);
  const status = !task ? 'Already done or deleted' : match[2] === 'c' ? '✅ Done' : '💤 Snoozed 15 min';
  await answer(status);
  await tg('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: query.message.message_id,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {});
  if (task) await send(chatId, `${status}: ${task.content}`);
}
