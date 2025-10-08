'use server';

import { generateResponseFromIntentAndEntities } from '@/ai/flows/generate-response-from-intent-and-entities';
import { summarizeConversationForMemory } from '@/ai/flows/summarize-conversation-for-memory';
import type { Task, Message } from '@/lib/types';
import redisClient from '@/lib/redis';

export async function getMessages(conversationId: string): Promise<Message[]> {
    try {
        const history = await redisClient.lRange(conversationId, 0, -1);
        return history.map(item => JSON.parse(item)).reverse();
    } catch (error) {
        console.error('Error getting messages from Redis:', error);
        return [];
    }
}

export async function getAiResponse(userInput: string, conversationId: string): Promise<{ response: string; intent: string; entities: string[], task: Omit<Task, 'id'> | null }> {
    try {
        const messages = await getMessages(conversationId);

        const userMessage: Message = { role: 'user', content: userInput, createdAt: new Date(), id: conversationId };
        messages.push(userMessage);

        await redisClient.rPush(conversationId, JSON.stringify(userMessage));
        await redisClient.lTrim(conversationId, -100, -1);

        const result = await generateResponseFromIntentAndEntities({ userInput, messages });

        if (!result.response) {
            throw new Error('AI failed to generate a response.');
        }

        const aiMessage: Message = { role: 'assistant', content: result.response, createdAt: new Date(), id: conversationId };
        await redisClient.rPush(conversationId, JSON.stringify(aiMessage));

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
