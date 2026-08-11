import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie } from '@/server/auth';
import {
  createGoogleUser,
  getUserByEmail,
  getUserByGoogleId,
  linkGoogleId,
} from '@/server/db';

// Step 2 of Google sign-in: Google redirects back here with a one-time code.
// Exchange it for tokens, fetch the profile, find-or-create the user, set the
// session cookie, land on /chat. Any failure bounces to /login?error=google.

const STATE_COOKIE = 'saba_oauth_state';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const fail = (reason: string): NextResponse => {
    console.error('[auth/google]', reason);
    const res = NextResponse.redirect(new URL('/login?error=google', request.nextUrl.origin));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
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
      redirect_uri: `${request.nextUrl.origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) {
    return fail(`token exchange ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 300)}`);
  }
  const { access_token: accessToken } = await tokenRes.json();
  if (typeof accessToken !== 'string') return fail('no access_token in response');

  // Token → profile. Fetched straight from Google over TLS, so no JWT
  // verification is needed (we never trust a token from the browser).
  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
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
      user = await getUserByEmail(email);
      if (user) {
        await linkGoogleId(user.id, sub);
      } else {
        user = await createGoogleUser(email, typeof name === 'string' && name ? name : email.split('@')[0], sub);
      }
    }
    await setSessionCookie(user.id);
  } catch (err) {
    return fail(`user lookup/create failed: ${(err as Error).message}`);
  }
  const res = NextResponse.redirect(new URL('/chat', request.nextUrl.origin));
  res.cookies.delete(STATE_COOKIE);
  return res;
}
