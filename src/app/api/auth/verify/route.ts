import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { markEmailVerified } from '@/server/db';
import { hasEmailKey, parseVerifyToken, sendEmail, verificationEmail, verifyLink } from '@/server/email';
import { handle, limit } from '@/server/http';

// GET: the link in the verification email. POST: resend it (signed-in user).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseVerifyToken(request.nextUrl.searchParams.get('token') ?? '');
  const ok = parsed ? await markEmailVerified(parsed.userId, parsed.email) : false;
  return NextResponse.redirect(new URL(`/chat?verified=${ok ? '1' : '0'}`, request.nextUrl.origin));
}

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
  if (!hasEmailKey()) {
    return NextResponse.json({ error: 'Email is not configured on this server' }, { status: 503 });
  }
  await limit(`verify:${user.id}`, 3, 3600);
  const origin = request.nextUrl.origin;
  await sendEmail({ email: user.email, name: user.name }, verificationEmail(user.name, verifyLink(user, origin), origin));
  return NextResponse.json({ ok: true });
});
