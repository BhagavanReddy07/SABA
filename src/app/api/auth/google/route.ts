import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

// Step 1 of Google sign-in: bounce the browser to Google's consent screen.
// ponytail: plain OAuth 2.0 redirect flow, no auth library.

const STATE_COOKIE = 'saba_oauth_state';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured' },
      { status: 503 }
    );
  }

  // Random state round-trips via cookie to block CSRF'd callbacks.
  const state = randomBytes(16).toString('base64url');

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${request.nextUrl.origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);

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
