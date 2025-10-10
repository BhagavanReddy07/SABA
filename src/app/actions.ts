'use server';

import { generateResponseFromIntentAndEntities } from '@/ai/flows/generate-response-from-intent-and-entities';
import { summarizeConversationForMemory } from '@/ai/flows/summarize-conversation-for-memory';
import type { Task, Message } from '@/lib/types';
import redisClient from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

export async function getMessages(conversationId: string): Promise<Message[]> {
    try {
        const history = await redisClient.lRange(conversationId, 0, -1);
        // Redis list is stored oldest -> newest when using rPush; return in that natural chronological order
        return history.map(item => JSON.parse(item));
    } catch (error) {
        console.error('Error getting messages from Redis:', error);
        return [];
    }
}

export async function getAiResponse(userInput: string, conversationId: string): Promise<{ response: string; intent: string; entities: string[], task: Omit<Task, 'id'> | null }> {
    try {
        const messages = await getMessages(conversationId);

    // generate a unique id for each message
    const userMessage: Message = { role: 'user', content: userInput, createdAt: new Date(), id: uuidv4() };
        messages.push(userMessage);

        await redisClient.rPush(conversationId, JSON.stringify(userMessage));
        await redisClient.lTrim(conversationId, -100, -1);

        // Summarize older conversation if it grows large and reuse summary to reduce prompt size
        const SUMMARY_KEY = `conv:${conversationId}:summary`;
        const RECENT_COUNT = 6; // include last N messages verbatim
        const SUMMARIZE_THRESHOLD = 12; // when total messages exceed this, summarize older portion

        let summary = await redisClient.get(SUMMARY_KEY);

        if (!summary && messages.length > SUMMARIZE_THRESHOLD) {
            // Summarize all but the most recent RECENT_COUNT messages
            const older = messages.slice(0, Math.max(0, messages.length - RECENT_COUNT));
            const mem = await summarizeConversation(older);
            if (mem) {
                summary = mem;
                // persist summary for future requests
                await redisClient.set(SUMMARY_KEY, summary);
            }
        }

        // Compose history: optional summary + recent messages (oldest->newest within recent window)
        const recent = messages.slice(-RECENT_COUNT);
        const historyParts: string[] = [];
        if (summary) {
            historyParts.push(`Summary: ${summary}`);
            historyParts.push('Recent conversation:');
        }
        historyParts.push(...recent.map(m => `${m.role}: ${m.content}`));
        const historyText = historyParts.join('\n');

        const result = await generateResponseFromIntentAndEntities({ userInput, history: historyText });

        if (!result.response) {
            throw new Error('AI failed to generate a response.');
        }

    const aiMessage: Message = { role: 'assistant', content: result.response, createdAt: new Date(), id: uuidv4() };
                await redisClient.rPush(conversationId, JSON.stringify(aiMessage));

                // periodically update the summary after adding the assistant message to capture new info
                const newMessageCount = messages.length + 1;
                if (newMessageCount > SUMMARIZE_THRESHOLD && newMessageCount % 20 === 0) {
                    // resummarize whole conversation (could be optimized to incremental updates)
                    const allMessages = await getMessages(conversationId);
                    const newSummary = await summarizeConversation(allMessages);
                    if (newSummary) {
                        await redisClient.set(SUMMARY_KEY, newSummary);
                    }
                }

        return result;

    } catch (error) {
        console.error("Error getting AI response:", error);
        return {
            response: "I'm sorry, I encountered an error while processing your request. Please try again.",
            intent: 'error',
            entities: [],
            task: null,
        };
    }
}

export async function summarizeConversation(messages: Message[]): Promise<string | null> {
    try {
        const { summary } = await summarizeConversationForMemory({ messages });
        return summary;
    } catch (error) {
        console.error("Error summarizing conversation:", error);
        return null;
    }
}
