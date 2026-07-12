// The chat pipeline: recall memory → generate → remember.

import type { ChatResponse } from '@/lib/types';
import {
  createConversation,
  getConversation,
  saveMessage,
  touchConversation,
} from './db';
import { generateText, hasGeminiKey } from './gemini';
import { recall, remember, type Recall } from './memory';

export async function chat(
  userId: string,
  userName: string,
  input: string,
  conversationId?: string
): Promise<ChatResponse> {
  // Resolve or create the conversation (title = first message, trimmed).
  let conversation = conversationId
    ? await getConversation(conversationId, userId)
    : null;
  if (!conversation) {
    const title = input.length > 48 ? `${input.slice(0, 48)}…` : input;
    conversation = await createConversation(userId, title);
  }

  const memory = await recall(userId, conversation.id, input);

  let reply: string;
  if (hasGeminiKey()) {
    try {
      reply = await generateText(buildSystemPrompt(userName, memory), input);
    } catch (err) {
      console.error('[assistant] generation failed:', err);
      reply =
        "I'm having trouble reaching my language model right now — please try again in a moment.";
    }
  } else {
    reply = demoReply(memory);
  }

  // Tier 2: persist both turns, then update the other tiers.
  const userMessage = await saveMessage(conversation.id, 'user', input);
  const assistantMessage = await saveMessage(conversation.id, 'assistant', reply);
  await touchConversation(conversation.id);
  await remember(userId, conversation.id, userMessage, reply);

  return {
    conversationId: conversation.id,
    title: conversation.title,
    message: { ...assistantMessage, memoryTrace: memory.trace },
  };
}

function buildSystemPrompt(userName: string, memory: Recall): string {
  const sections: string[] = [
    `You are SABA, a personal AI assistant with a layered long-term memory.
You are talking to ${userName}. Be warm, concise, and concrete.
Use the memory sections below naturally — reference past context when relevant,
but never recite memory verbatim or mention "tiers" or "databases".`,
  ];

  if (memory.facts.length > 0) {
    sections.push(
      `WHAT YOU KNOW ABOUT THE USER:\n${memory.facts.map((f) => `- ${f.content}`).join('\n')}`
    );
  }

  if (memory.semantic.length > 0) {
    sections.push(
      `RELEVANT MOMENTS FROM PAST CONVERSATIONS:\n${memory.semantic
        .map((s) => `- ${s.content}`)
        .join('\n')}`
    );
  }

  if (memory.window.length > 0) {
    sections.push(
      `CURRENT CONVERSATION SO FAR:\n${memory.window
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')}`
    );
  }

  return sections.join('\n\n');
}

/** Without an API key the app still works end-to-end for demos. */
function demoReply(memory: Recall): string {
  const parts = [
    "I'm running in demo mode (no GEMINI_API_KEY configured), so I can't generate a real answer — but my memory system is live:",
    `• Working memory holds ${memory.trace.workingMemory} recent message${memory.trace.workingMemory === 1 ? '' : 's'} from this conversation.`,
    `• I've stored ${memory.trace.episodic.length} long-term fact${memory.trace.episodic.length === 1 ? '' : 's'} about you.`,
  ];
  if (memory.trace.semantic.length > 0) {
    parts.push(
      `• Semantic recall surfaced: "${memory.trace.semantic[0].content.slice(0, 120)}"`
    );
  }
  parts.push('Add a Gemini API key to .env to unlock full responses.');
  return parts.join('\n');
}
