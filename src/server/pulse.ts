// Scheduled work, all driven by the one existing cron job (GET /api/cron/reminders, ~every 5 min):
// reminders → morning briefs (SABA Pulse) → nightly consolidation (SABA Sleep) → housekeeping.
// Each step is bounded so a run fits comfortably inside a 60 s serverless invocation.

import { daysUntil, inDays, secondPerson } from '@/lib/format';
import {
  cleanupRateLimits,
  countRemindersSentToday,
  deletePushSubscription,
  listBriefCandidates,
  listConsolidationCandidates,
  listDueTasks,
  listGoals,
  listMemories,
  listPushSubscriptions,
  listTasks,
  markBriefSent,
  markTaskReminded,
  type DbUser,
} from './db';
import { briefEmail, createTaskActionToken, formatDue, hasEmailKey, reminderEmail, sendEmail, type Brief } from './email';
import { consolidateUser } from './memory/consolidate';
import { hasPush, sendPush, type PushPayload } from './push';
import { hasTelegram, sendReminderTelegram, sendTelegramText } from './telegram';

const EMAIL_CAP_PER_DAY = 25;

async function pushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  if (!hasPush()) return false;
  let delivered = false;
  for (const sub of await listPushSubscriptions(userId)) {
    const result = await sendPush(sub, payload);
    if (result === 'gone') await deletePushSubscription(sub.endpoint);
    delivered ||= result === 'ok';
  }
  return delivered;
}

export async function deliverReminders(baseUrl: string): Promise<{ due: number; sent: number; failed: number }> {
  const due = await listDueTasks();
  const emailsToday = new Map<string, number>();
  let sent = 0;
  let failed = 0;

  for (const task of due) {
    let attempted = false;
    let delivered = false;

    if (hasEmailKey() && task.emailVerified) {
      const count = emailsToday.get(task.userId) ?? (await countRemindersSentToday(task.userId));
      if (count < EMAIL_CAP_PER_DAY) {
        attempted = true;
        try {
          await sendEmail({ email: task.userEmail, name: task.userName }, reminderEmail(task, baseUrl));
          emailsToday.set(task.userId, count + 1);
          delivered = true;
        } catch (err) {
          console.error('[cron/reminders] email', task.id, (err as Error).message);
        }
      }
    }
    if (hasTelegram() && task.telegramChatId) {
      attempted = true;
      delivered = (await sendReminderTelegram(task)) || delivered;
    }
    if (hasPush()) {
      const subs = await listPushSubscriptions(task.userId);
      if (subs.length) {
        attempted = true;
        delivered =
          (await pushToUser(task.userId, {
            title: `⏰ ${task.content}`,
            body: task.dueAt ? formatDue(task.dueAt, task.userTimezone) : 'Reminder',
            url: '/chat',
            actions: [
              { action: 'complete', title: '✓ Done', token: createTaskActionToken(task.id, 'complete') },
              { action: 'snooze', title: '💤 Snooze 15 min', token: createTaskActionToken(task.id, 'snooze') },
            ],
          })) || delivered;
      }
    }

    // Retry transient failures on the next run, but give up on a reminder a day late (bad address etc.).
    const stale = task.dueAt !== null && Date.now() - Date.parse(task.dueAt) > 86_400_000;
    if (delivered || !attempted || stale) await markTaskReminded(task.id);
    if (delivered) sent++;
    else if (attempted) failed++;
  }
  return { due: due.length, sent, failed };
}

/** The morning brief's content for one user (null when there's nothing worth sending). */
export async function buildBrief(user: DbUser, localDate: string): Promise<Brief | null> {
  const tz = user.timezone ?? 'UTC';
  const localDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
  const [tasks, memories, goals] = await Promise.all([listTasks(user.id), listMemories(user.id), listGoals(user.id)]);

  const now = Date.now();
  const today = tasks
    .filter((t) => !t.completedAt && t.dueAt && (localDay(t.dueAt) === localDate || Date.parse(t.dueAt) < now))
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
    .slice(0, 8)
    .map((t) => ({
      content: t.content,
      when: new Date(t.dueAt!).toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', ...(localDay(t.dueAt!) !== localDate && { month: 'short', day: 'numeric' }) }),
      overdue: Date.parse(t.dueAt!) < now,
    }));

  const dates = memories
    .filter((m) => m.eventDate)
    .map((m) => ({ m, days: daysUntil(m.eventDate!, localDate) }))
    .filter((x): x is { m: (typeof memories)[number]; days: number } => x.days !== null && x.days <= 7)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4)
    .map(({ m, days }) => ({
      label: secondPerson(m.content),
      when: inDays(days),
      prompt: `Help me prepare for this: ${secondPerson(m.content)} It's ${inDays(days)}.`,
    }));

  // Check in on the goal that has gone longest without progress.
  const quiet = goals
    .map((g) => ({ g, last: g.logs[0] ? Date.parse(g.logs[0].createdAt) : 0 }))
    .sort((a, b) => a.last - b.last)[0]?.g;
  const goal = quiet
    ? { text: `${secondPerson(quiet.memory.content)} How's it going?`, prompt: `Let's check in on my goal: ${secondPerson(quiet.memory.content)}` }
    : null;

  if (!today.length && !dates.length && !goal) return null;
  return { name: user.name, today, dates, goal };
}

export async function sendBriefs(baseUrl: string, deadline: number): Promise<number> {
  let sent = 0;
  for (const user of await listBriefCandidates(20)) {
    if (Date.now() > deadline) break;
    const brief = await buildBrief(user, user.localDate);
    if (brief) {
      if (hasEmailKey() && user.emailVerifiedAt) {
        await sendEmail({ email: user.email, name: user.name }, briefEmail(brief, baseUrl)).catch((err) =>
          console.error('[cron/brief] email', user.id, (err as Error).message)
        );
      }
      if (user.telegramChatId) {
        const lines = [
          `☀️ **Good morning, ${user.name.split(' ')[0]}!**`,
          ...(brief.today.length ? brief.today.map((t) => `• ${t.content} — ${t.overdue ? 'overdue · ' : ''}${t.when}`) : ['• Nothing scheduled today.']),
          ...brief.dates.map((d) => `🗓 ${d.label} (${d.when})`),
          ...(brief.goal ? [`🎯 ${brief.goal.text}`] : []),
        ];
        await sendTelegramText(user.telegramChatId, lines.join('\n'));
      }
      await pushToUser(user.id, {
        title: `☀️ Good morning, ${user.name.split(' ')[0]}`,
        body: brief.today.length ? `${brief.today.length} thing${brief.today.length === 1 ? '' : 's'} today` : 'Your SABA brief is ready',
        url: '/chat',
      });
      sent++;
    }
    await markBriefSent(user.id, user.localDate);
  }
  return sent;
}

export async function runConsolidation(deadline: number): Promise<number> {
  let done = 0;
  for (const user of await listConsolidationCandidates(2)) {
    if (Date.now() > deadline) break;
    await consolidateUser(user.id).catch((err) => console.error('[cron/sleep]', user.id, (err as Error).message));
    done++;
  }
  return done;
}

export async function cronTick(baseUrl: string) {
  const deadline = Date.now() + 40_000;
  const reminders = await deliverReminders(baseUrl);
  const briefs = await sendBriefs(baseUrl, deadline).catch((err) => {
    console.error('[cron/brief]', err);
    return 0;
  });
  const consolidated = await runConsolidation(deadline).catch((err) => {
    console.error('[cron/sleep]', err);
    return 0;
  });
  await cleanupRateLimits().catch(() => {});
  return { ...reminders, briefs, consolidated };
}
