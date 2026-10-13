import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSessionUser } from '@/server/auth';
import { CALENDAR_SCOPE } from '@/server/calendar';

// Step 1 of Google OAuth: bounce the browser to Google's consent screen.
//   /api/auth/google            → sign in
//   /api/auth/google?calendar=1 → connect Google Calendar to the signed-in account
// ponytail: plain OAuth 2.0 redirect flow, no auth library.

const STATE_COOKIE = 'saba_oauth_state';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/login?error=google-unconfigured', request.nextUrl.origin));
  }

  const calendar = request.nextUrl.searchParams.get('calendar') === '1';
  if (calendar && !(await getSessionUser())) {
    return NextResponse.redirect(new URL('/login', request.nextUrl.origin));
  }

  // Random state round-trips via cookie to block CSRF'd callbacks; the prefix records the intent.
  const state = `${calendar ? 'cal' : 'in'}.${randomBytes(16).toString('base64url')}`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${request.nextUrl.origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  if (calendar) {
    url.searchParams.set('scope', `openid email ${CALENDAR_SCOPE}`);
    url.searchParams.set('access_type', 'offline'); // → refresh token
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
  } else {
    url.searchParams.set('scope', 'openid email profile');
  }

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });
  return res;
}
