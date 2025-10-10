import { NextResponse } from 'next/server';
import { generateResponseFromIntentAndEntities } from '@/ai/flows/generate-response-from-intent-and-entities';

export async function GET() {
  try {
    const input = {
      userInput: 'Hi, remind me to buy bananas tomorrow at 9am',
      history: 'user: earlier we talked about fruits\nassistant: yes you mentioned bananas',
    };

    const result = await generateResponseFromIntentAndEntities(input as any);
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    // return detailed error for debugging (avoid leaking secrets)
    const message = error?.message || String(error);
    const stack = error?.stack || null;
    return NextResponse.json({ ok: false, message, stack }, { status: 500 });
  }
}
