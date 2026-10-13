import { NextResponse } from 'next/server';
import { hasGoogleOAuth } from '@/server/calendar';
import { hasEmailKey } from '@/server/email';
import { hasChatKey, hasVision } from '@/server/llm';
import { hasWebSearch } from '@/server/lookup';
import { vapidPublicKey } from '@/server/push';
import { hasTelegram } from '@/server/telegram';
import type { PublicConfig } from '@/lib/types';

/** Which optional services this deployment has — the UI hides what can't work. */
export function GET(): NextResponse {
  const config: PublicConfig = {
    llm: hasChatKey(),
    vision: hasVision(),
    google: hasGoogleOAuth(),
    email: hasEmailKey(),
    telegram: hasTelegram(),
    calendar: hasGoogleOAuth(),
    webSearch: hasWebSearch(),
    push: vapidPublicKey(),
  };
  return NextResponse.json(config, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
