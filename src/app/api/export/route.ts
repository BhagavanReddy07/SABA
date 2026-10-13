import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { exportUserData } from '@/server/db';
import { handle, limit } from '@/server/http';

/** "Download my data": profile, every conversation, all memories (with history), tasks, documents, goal logs. */
export const GET = handle(async () => {
  const user = await requireUser();
  await limit(`export:${user.id}`, 10, 3600);
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="saba-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
