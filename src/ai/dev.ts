// Import genkit first to ensure env is loaded
import '@/ai/genkit';

// Then import all flows
import '@/ai/flows/generate-response-from-intent-and-entities.ts';
import '@/ai/flows/initial-intent-detection.ts';
import '@/ai/flows/extract-entities-from-message.ts';
import '@/ai/flows/summarize-conversation-for-memory.ts';
