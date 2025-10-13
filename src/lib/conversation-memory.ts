import { getRedisClient } from './redis';
import { initializePinecone, getPineconeService, ConversationContext } from './pinecone';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  entities?: string[];
  intent?: string;
}

export interface UserPreferences {
  name?: string;
  preferences?: {
    mealPreferences?: string[];
    dietaryRestrictions?: string[];
    favoriteTopics?: string[];
    communicationStyle?: 'formal' | 'casual' | 'friendly';
    fitnessGoals?: string[];
  };
  personalInfo?: {
    location?: string;
    timezone?: string;
    language?: string;
  };
}

export interface ConversationSummary {
  id: string;
  userId: string;
  summary: string;
  keyPoints: string[];
  timestamp: Date;
  messageCount: number;
}

export class ConversationMemoryManager {
  private static instance: ConversationMemoryManager;

  static getInstance(): ConversationMemoryManager {
    if (!ConversationMemoryManager.instance) {
      ConversationMemoryManager.instance = new ConversationMemoryManager();
    }
    return ConversationMemoryManager.instance;
  }

  async saveMessage(message: ConversationMessage): Promise<void> {
    try {
      const client = await getRedisClient();
      const key = `conversation:${message.id}`;
      await client.setEx(key, 7 * 24 * 60 * 60, JSON.stringify(message)); // 7 days
      console.log('Message saved with key:', key);

      // Also save to conversation history list (use a fixed key for users)
      const historyKey = message.id === 'users_list' ? 'users_list' : `conversation:history:${message.id}`;
      await client.lPush(historyKey, JSON.stringify(message));
      await client.lTrim(historyKey, 0, 99); // Keep last 100 messages
      await client.expire(historyKey, 7 * 24 * 60 * 60);
      console.log('Message added to history list:', historyKey);
    } catch (error) {
      console.error('Error saving message to Redis:', error);
      throw error; // Re-throw to see the actual error
    }
  }

  async getConversationHistory(conversationId: string, limit: number = 50): Promise<ConversationMessage[]> {
    try {
      const client = await getRedisClient();
      // Special handling for 'users_list' to match how it's saved
      const historyKey = conversationId === 'users_list' ? 'users_list' : `conversation:history:${conversationId}`;
      const messages = await client.lRange(historyKey, 0, limit - 1);

      return messages
        .map((msg: string) => {
          try {
            return JSON.parse(msg);
          } catch {
            return null;
          }
        })
        .filter((msg): msg is ConversationMessage => msg !== null)
        .reverse(); // Reverse to get chronological order
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  async saveUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    try {
      const client = await getRedisClient();
      const key = `user:preferences:${userId}`;
      await client.setEx(key, 30 * 24 * 60 * 60, JSON.stringify(preferences)); // 30 days
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      const client = await getRedisClient();
      const key = `user:preferences:${userId}`;
      const preferences = await client.get(key);

      if (preferences) {
        return JSON.parse(preferences);
      }
      return null;
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return null;
    }
  }

  async saveConversationSummary(summary: ConversationSummary): Promise<void> {
    try {
      const client = await getRedisClient();
      const key = `conversation:summary:${summary.id}`;
      await client.setEx(key, 30 * 24 * 60 * 60, JSON.stringify(summary)); // 30 days

      // Also save to summaries list for the user
      const summariesKey = `user:summaries:${summary.userId}`;
      await client.lPush(summariesKey, summary.id);
      await client.lTrim(summariesKey, 0, 19); // Keep last 20 summaries
    } catch (error) {
      console.error('Error saving conversation summary:', error);
    }
  }

  async getConversationSummaries(userId: string): Promise<ConversationSummary[]> {
    try {
      const client = await getRedisClient();
      const summariesKey = `user:summaries:${userId}`;
      const summaryIds = await client.lRange(summariesKey, 0, 19);

      const summaries: ConversationSummary[] = [];
      for (const id of summaryIds) {
        const summary = await client.get(`conversation:summary:${id}`);
        if (summary) {
          summaries.push(JSON.parse(summary));
        }
      }

      return summaries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Error getting conversation summaries:', error);
      return [];
    }
  }

  async formatConversationHistory(messages: ConversationMessage[]): Promise<string> {
    return messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  async generateContextualPrompt(
    currentInput: string,
    conversationId: string,
    userId: string
  ): Promise<{prompt: string, history: string}> {
    console.log('🔍 Generating contextual prompt for:', { currentInput, conversationId, userId });

    // Get recent conversation history
    const recentMessages = await this.getConversationHistory(conversationId, 20);
    console.log('📜 Recent messages:', recentMessages.length);

    // Get user preferences
    const preferences = await this.getUserPreferences(userId);
    console.log('👤 User preferences:', preferences);

    // Get similar contexts from Pinecone for enhanced memory
    const similarContexts = await this.getSimilarContexts(currentInput, userId);
    console.log('🔗 Similar contexts found:', similarContexts.length);

    // Format history for context
    const history = await this.formatConversationHistory(recentMessages);

    // Format similar contexts for additional context
    const similarContextText = similarContexts.length > 0
      ? `\nRELEVANT PAST CONTEXTS:\n${similarContexts.map(ctx =>
          `From ${ctx.metadata.timestamp}: ${ctx.metadata.messageType === 'user' ? 'User' : 'Assistant'} - ${ctx.metadata.intent || 'general'}`
        ).join('\n')}`
      : '';

    // Build contextual prompt with enhanced personalization
    const userName = preferences?.name || 'there';
    const fitnessGoals = preferences?.preferences?.fitnessGoals || [];
    const favoriteTopics = preferences?.preferences?.favoriteTopics || [];

    console.log('🏗️ Building prompt with:', { userName, fitnessGoals, favoriteTopics });

    let prompt = `You are SABA, an intelligent AI assistant with excellent memory and context retention.

USER PROFILE:
- Name: ${preferences?.name || 'Not specified'}
- Fitness Goals: ${fitnessGoals.join(', ') || 'Not specified'}
- Interests: ${favoriteTopics.join(', ') || 'Not specified'}

CONVERSATION HISTORY:
${history || 'This is the start of our conversation.'}${similarContextText}

CURRENT USER INPUT: "${currentInput}"

INSTRUCTIONS:
1. **Context Retention**: Remember and reference previous parts of the conversation naturally.
2. **Personalization**: Always address the user by name: "${userName}". Reference their fitness goals and interests.
3. **Consistency**: Maintain consistent personality and remember user preferences across all interactions.
4. **Helpfulness**: Be proactive in offering relevant assistance based on their fitness goals and interests.
5. **Memory Integration**: Use relevant past contexts to provide more informed, personalized responses.
6. **Goal-Oriented**: Since they want to gain weight, focus on nutrition, meal planning, and fitness strategies.

Please provide a helpful, contextual response that builds upon our conversation history and directly addresses their weight gain goals.`;

    console.log('✅ Generated contextual prompt, length:', prompt.length);
    return { prompt, history: history + similarContextText };
  }

  async storeMessageContext(message: ConversationMessage): Promise<void> {
    try {
      // Store in Redis (existing functionality)
      await this.saveMessage(message);

      // Store in Pinecone for vector search
      const pineconeService = getPineconeService();
      if (pineconeService) {
        const context: ConversationContext = {
          id: `ctx_${message.id}_${Date.now()}`,
          content: message.content,
          metadata: {
            conversationId: message.id,
            userId: 'default_user', // You might want to add userId to the message interface
            timestamp: message.timestamp.toISOString(),
            messageType: message.role,
            entities: message.entities,
            intent: message.intent
          }
        };

        await pineconeService.storeConversationContext(context);
        console.log(`Stored message context in Pinecone: ${context.id}`);
      }
    } catch (error) {
      console.error('Error storing message context:', error);
    }
  }

  async getSimilarContexts(query: string, userId: string, limit: number = 3): Promise<ConversationContext[]> {
    try {
      const pineconeService = getPineconeService();
      if (!pineconeService) {
        console.warn('Pinecone service not available');
        return [];
      }

      return await pineconeService.searchSimilarContexts(query, userId, limit);
    } catch (error) {
      console.error('Error getting similar contexts:', error);
      return [];
    }
  }

  async initializePinecone(): Promise<void> {
    try {
      const pineconeService = initializePinecone();
      await pineconeService.initialize();
      console.log('Pinecone initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Pinecone:', error);
    }
  }
}

export const conversationMemory = ConversationMemoryManager.getInstance();

// Initialize Pinecone on module load
conversationMemory.initializePinecone().catch(error => {
  console.error('Failed to initialize Pinecone on startup:', error);
});
