'use server';

import { generateResponseFromIntentAndEntities } from '@/ai/flows/generate-response-from-intent-and-entities';
import { summarizeConversationForMemory } from '@/ai/flows/summarize-conversation-for-memory';
import type { Task, Message } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { getMessagesByConversationId, saveMessage, saveConversation } from '@/lib/db'; // Import DB functions
import redisClient from '@/lib/redis'; // Keep redis for summaries for now
import { conversationMemory } from '@/lib/conversation-memory';
import { getPineconeService } from '@/lib/pinecone';

export async function getMessages(conversationId: string): Promise<Message[]> {
    try {
        // Fetch messages from PostgreSQL
        return await getMessagesByConversationId(conversationId);
    } catch (error) {
        console.error('Error getting messages from PostgreSQL:', error);
        return [];
    }
}

export async function getAiResponse(userInput: string, conversationId: string, userId: string): Promise<{ response: string; intent: string; entities: string[], task: Omit<Task, 'id'> | null, shouldCreateTask?: boolean, taskType?: string, taskContent?: string, taskTime?: string }> {
    try {
        const messages = await getMessages(conversationId);

        // Create and save user message to PostgreSQL
        const userMessage: Message = {
            id: uuidv4(),
            role: 'user',
            content: userInput,
            createdAt: new Date(),
            userId: userId,
            conversationId: conversationId,
        };

        // Store user message in conversation memory for context
        await conversationMemory.storeMessageContext({
            id: userMessage.id,
            role: 'user',
            content: userInput,
            timestamp: new Date(),
            entities: [], // Will be filled by AI processing
            intent: '' // Will be filled by AI processing
        });

        // First ensure the conversation exists in the database
        const conversationTitle = userInput.substring(0, 30) + (userInput.length > 30 ? '...' : '');
        await saveConversation({
            id: conversationId,
            userId: userId,
            title: conversationTitle,
            createdAt: new Date(),
            isActive: true,
        });

        await saveMessage(userMessage);
        messages.push(userMessage); // Add to local messages array for context

        // Update conversation's last_updated timestamp
        await saveConversation({
            id: conversationId,
            userId: userId,
            title: messages[0]?.content.substring(0, 30) + (messages[0]?.content.length > 30 ? '...' : '') || 'New Chat',
            createdAt: messages[0]?.createdAt || new Date(),
            isActive: true, // Assuming active
        });

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

        // Generate contextual prompt using enhanced memory system
        const { prompt } = await conversationMemory.generateContextualPrompt(userInput, conversationId, userId);

        // Use the enhanced prompt for better context retention
        const aiInput = {
          userInput,
          history: historyText
        };

        const result = await generateResponseFromIntentAndEntities(aiInput);

        if (!result.response) {
            throw new Error('AI failed to generate a response.');
        }

        // Create and save AI message to PostgreSQL
        const aiMessage: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: result.response,
            createdAt: new Date(),
            userId: userId,
            conversationId: conversationId,
            intent: result.intent || undefined,
            entities: [],
        };
        await saveMessage(aiMessage);

        // Store AI response in conversation memory for context
        await conversationMemory.storeMessageContext({
            id: aiMessage.id,
            role: 'assistant',
            content: result.response,
            timestamp: new Date(),
            entities: result.entities || [],
            intent: result.intent || ''
        });

        // Extract and store user preferences from this conversation
        await updateUserPreferences(userId, userInput, result.intent, result.entities);

        // periodically update the summary after adding the assistant message to capture new info
        const newMessageCount = messages.length + 1; // +1 for the AI message just added
        if (newMessageCount > SUMMARIZE_THRESHOLD && newMessageCount % 20 === 0) {
            // resummarize whole conversation (could be optimized to incremental updates)
            const allMessages = await getMessages(conversationId); // Get all messages including the new AI one
            const newSummary = await summarizeConversation(allMessages);
            if (newSummary) {
                await redisClient.set(SUMMARY_KEY, newSummary);
            }
        }

        // Construct the task object to match Omit<Task, 'id'>
        let taskToReturn: Omit<Task, 'id'> | null = null;
        if (result.task) {
            taskToReturn = {
                type: result.task.type,
                content: result.task.content,
                time: result.task.time,
                completed: false, // Default to false
                createdAt: new Date(),
                userId: userId,
                conversationId: conversationId,
                priority: 'medium', // Default priority
                tags: [], // Default tags
            };
        }

        return {
            response: result.response,
            intent: result.intent,
            entities: result.entities,
            task: taskToReturn,
            shouldCreateTask: result.shouldCreateTask,
            taskType: result.taskType,
            taskContent: result.taskContent,
            taskTime: result.taskTime,
        };

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

// Debug function to check conversation memory
export async function debugConversationMemory(conversationId: string, userId: string) {
    try {
        console.log('🔍 DEBUG: Checking conversation memory for:', { conversationId, userId });

        const preferences = await conversationMemory.getUserPreferences(userId);
        console.log('🔍 DEBUG: User preferences:', preferences);

        const history = await conversationMemory.getConversationHistory(conversationId, 10);
        console.log('🔍 DEBUG: Conversation history length:', history.length);

        const similarContexts = await conversationMemory.getSimilarContexts("test query", userId);
        console.log('🔍 DEBUG: Similar contexts found:', similarContexts.length);

        return {
            preferences,
            historyLength: history.length,
            similarContextsCount: similarContexts.length,
            pineconeAvailable: !!getPineconeService()
        };
    } catch (error) {
        console.error('🔍 DEBUG: Error checking memory:', error);
        return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// Helper function to extract and store user preferences
async function updateUserPreferences(userId: string, userInput: string, intent: string, entities: string[]): Promise<void> {
    try {
        console.log('🔄 Updating user preferences for:', userId, { userInput, intent, entities });

        // Get existing preferences
        const existingPreferences = await conversationMemory.getUserPreferences(userId) || {};
        console.log('📋 Existing preferences:', existingPreferences);

        // Extract name from conversation
        const nameMatch = userInput.match(/(?:my name is|I am|I'm|I call myself)\s+([A-Za-z]+)/i);
        if (nameMatch) {
            const extractedName = nameMatch[1];
            console.log('👤 Extracted name:', extractedName);
            if (!existingPreferences.name) {
                existingPreferences.name = extractedName;
                console.log('✅ Stored name:', extractedName);
            }
        }

        // Extract goals and preferences based on intent and entities
        if (intent === 'meal_planning' || entities.includes('gym meal') || entities.includes('meal plan')) {
            if (!existingPreferences.preferences) existingPreferences.preferences = {};
            if (!existingPreferences.preferences.favoriteTopics) {
                existingPreferences.preferences.favoriteTopics = [];
            }
            if (!existingPreferences.preferences.favoriteTopics.includes('fitness')) {
                existingPreferences.preferences.favoriteTopics.push('fitness');
                console.log('✅ Added fitness to interests');
            }
            if (!existingPreferences.preferences.favoriteTopics.includes('nutrition')) {
                existingPreferences.preferences.favoriteTopics.push('nutrition');
                console.log('✅ Added nutrition to interests');
            }
        }

        if (intent === 'health_goal' || entities.includes('weight')) {
            if (!existingPreferences.preferences) existingPreferences.preferences = {};
            if (!existingPreferences.preferences.fitnessGoals) {
                existingPreferences.preferences.fitnessGoals = [];
            }
            if (userInput.toLowerCase().includes('gain') && !existingPreferences.preferences.fitnessGoals.includes('weight_gain')) {
                existingPreferences.preferences.fitnessGoals.push('weight_gain');
                console.log('✅ Added weight_gain to fitness goals');
            }
        }

        // Store updated preferences
        await conversationMemory.saveUserPreferences(userId, existingPreferences);
        console.log('💾 Final preferences stored:', existingPreferences);
    } catch (error) {
        console.error('❌ Error updating user preferences:', error);
    }
}
