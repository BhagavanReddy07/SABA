// Load env first
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
console.log('Initializing Genkit with API key:', apiKey ? 'Present' : 'Missing');

if (!apiKey) {
  throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY must be set');
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey,
    }),
  ],
  model: 'googleai/gemini-2.5-flash',
});
