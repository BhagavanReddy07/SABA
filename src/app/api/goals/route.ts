import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listGoals } from '@/server/db';
import { handle } from '@/server/http';

/** Goal memories with their progress logs (last 90 days) — the Goals panel computes streaks. */
export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ goals: await listGoals(user.id) });
});
