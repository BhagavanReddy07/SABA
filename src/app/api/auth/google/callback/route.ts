import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, setSessionCookie } from '@/server/auth';
import { CALENDAR_SCOPE } from '@/server/calendar';
import {
  createGoogleUser,
  getUserByEmail,
  getUserByGoogleId,
  linkGoogleId,
  saveGoogleToken,
} from '@/server/db';
import { seal } from '@/server/tokens';

// Step 2 of Google OAuth: Google redirects back here with a one-time code.
// Sign-in: code → tokens → profile → find, link or create the user → session → /chat.
// Calendar: code → refresh token (sealed) stored for the signed-in user → /chat?calendar=connected.

const STATE_COOKIE = 'saba_oauth_state';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const state = request.nextUrl.searchParams.get('state');
  const calendar = state?.startsWith('cal.') ?? false;
  const done = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  const fail = (reason: string): NextResponse => {
    console.error('[auth/google]', reason);
    return done(calendar ? '/chat?calendar=failed' : '/login?error=google');
  };

  const code = request.nextUrl.searchParams.get('code');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail('missing code or state mismatch');
  }

  // Code → tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) {
    return fail(`token exchange ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 300)}`);
  }
  const tokens = await tokenRes.json();
  if (typeof tokens.access_token !== 'string') return fail('no access_token in response');

  if (calendar) {
    const user = await getSessionUser();
    if (!user) return fail('calendar connect without a session');
    if (typeof tokens.refresh_token !== 'string' || !String(tokens.scope ?? '').includes(CALENDAR_SCOPE)) {
      return fail('calendar scope or refresh token not granted');
    }
    await saveGoogleToken(user.id, seal(tokens.refresh_token), String(tokens.scope));
    return done('/chat?calendar=connected');
  }

  // Token → profile. Fetched straight from Google over TLS, so no JWT
  // verification is needed (we never trust a token from the browser).
  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!profileRes.ok) return fail(`userinfo ${profileRes.status}`);
  const profile = await profileRes.json();
  const { sub, email, name } = profile;
  if (typeof sub !== 'string' || typeof email !== 'string' || !profile.email_verified) {
    return fail('profile missing sub/email or email unverified');
  }

  // Find by Google ID, else link to an existing email account, else create.
  try {
    let user = await getUserByGoogleId(sub);
    if (!user) {
      const existing = await getUserByEmail(email);
      if (existing) {
        await linkGoogleId(existing.id, sub);
        user = existing;
      } else {
        user = await createGoogleUser(email, typeof name === 'string' && name ? name.slice(0, 80) : email.split('@')[0], sub);
      }
    }
    await setSessionCookie(user);
  } catch (err) {
    return fail(`user lookup/create failed: ${(err as Error).message}`);
  }
  return done('/chat');
}
