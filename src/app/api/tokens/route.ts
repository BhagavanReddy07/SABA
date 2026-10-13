import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { createAccessToken, listAccessTokens } from '@/server/db';
import { randomToken, sha256 } from '@/server/tokens';
import { badRequest, handle, limit, readJson } from '@/server/http';

// Personal access tokens for the MCP server. The token is shown once; only its hash is stored.

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ tokens: await listAccessTokens(user.id) });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  await limit(`tokens:${user.id}`, 20, 86_400);
  const { name } = await readJson(request);
  if (typeof name !== 'string' || !name.trim() || name.length > 60) return badRequest('Give the token a name (max 60 chars)');
  const token = `saba_${randomToken(24)}`;
  const record = await createAccessToken(user.id, name.trim(), sha256(token), token.slice(0, 10));
  return NextResponse.json({ token, record });
});
