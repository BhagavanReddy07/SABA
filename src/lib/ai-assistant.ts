import { conversationMemory, ConversationMessage, UserPreferences } from './conversation-memory';
import { taskManager, Task } from './task-manager';
import { knowledgeBase, KnowledgeEntry } from './knowledge-base';
import { generateResponseFromIntentAndEntities } from '@/ai/flows/generate-response-from-intent-and-entities';
import { v4 as uuidv4 } from 'uuid';

export interface AIAssistantConfig {
  personality: {
    name: string;
    communicationStyle: 'formal' | 'casual' | 'friendly' | 'professional';
    expertise: string[];
    traits: string[];
  };
  capabilities: {
    canCreateTasks: boolean;
    canManageKnowledge: boolean;
    canSetReminders: boolean;
    canAccessExternalAPIs: boolean;
  };
  preferences: {
    maxResponseLength: number;
    defaultTaskPriority: 'low' | 'medium' | 'high';
    enableContextRetention: boolean;
  };
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  currentMessage: string;
  history: ConversationMessage[];
  userPreferences?: UserPreferences;
  recentTasks?: Task[];
  relevantKnowledge?: KnowledgeEntry[];
}

export class AIAssistant {
  private static instance: AIAssistant;
  private config: AIAssistantConfig;

  private constructor() {
    this.config = {
      personality: {
        name: 'SABA',
        communicationStyle: 'friendly',
        expertise: ['task management', 'conversation', 'information retrieval'],
        traits: ['helpful', 'patient', 'organized', 'context-aware']
      },
      capabilities: {
        canCreateTasks: true,
        canManageKnowledge: true,
        canSetReminders: true,
        canAccessExternalAPIs: false
      },
      preferences: {
        maxResponseLength: 500,
        defaultTaskPriority: 'medium',
        enableContextRetention: true
      }
    };
  }

  static getInstance(): AIAssistant {
    if (!AIAssistant.instance) {
      AIAssistant.instance = new AIAssistant();
    }
    return AIAssistant.instance;
  }

  async processMessage(
    userInput: string,
    conversationId: string = uuidv4(),
    userId: string = 'default_user'
  ): Promise<{
    response: string;
    intent: string;
    entities: string[];
    task?: Task;
    knowledgeEntries?: KnowledgeEntry[];
  }> {
    try {
      // Build conversation context
      const context = await this.buildConversationContext(userInput, conversationId, userId);

      // Generate AI response with full context
      const historyText = await conversationMemory.formatConversationHistory(context.history);

      const aiInput = {
        userInput,
        history: historyText
      };

      const aiResponse = await generateResponseFromIntentAndEntities(aiInput);

      // Save user message to memory
      const userMessage: ConversationMessage = {
        id: uuidv4(),
        role: 'user',
        content: userInput,
        timestamp: new Date(),
        conversationId,
        userId,
        entities: aiResponse.entities,
        intent: aiResponse.intent
      };
      await conversationMemory.saveMessage(userMessage);

      // Save AI response to memory
      const assistantMessage: ConversationMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: aiResponse.response,
        timestamp: new Date(),
        conversationId,
        userId,
        entities: aiResponse.entities,
        intent: aiResponse.intent
      };
      await conversationMemory.saveMessage(assistantMessage);

      // Handle task creation if needed
      let createdTask: Task | undefined;
      if (aiResponse.shouldCreateTask && aiResponse.taskContent) {
        const safeTaskType: 'Task' | 'Reminder' | 'Alarm' =
          aiResponse.taskType === 'Task' || aiResponse.taskType === 'Reminder' || aiResponse.taskType === 'Alarm'
            ? aiResponse.taskType
            : 'Task';

        createdTask = await taskManager.createTask({
          type: safeTaskType,
          content: aiResponse.taskContent,
          time: aiResponse.taskTime,
          userId,
          conversationId,
          priority: this.config.preferences.defaultTaskPriority,
          tags: aiResponse.entities
        });
      }

      // Get relevant knowledge if this is a knowledge-seeking query
      let relevantKnowledge: KnowledgeEntry[] | undefined;
      if (aiResponse.intent === 'Get Information' && aiResponse.entities.length > 0) {
        relevantKnowledge = await knowledgeBase.searchKnowledge({
          userId,
          tags: aiResponse.entities,
          limit: 3
        });
      }

      return {
        response: aiResponse.response,
        intent: aiResponse.intent,
        entities: aiResponse.entities,
        task: createdTask,
        knowledgeEntries: relevantKnowledge
      };

    } catch (error) {
      console.error('Error processing message:', error);
      return {
        response: "I'm sorry, I encountered an error while processing your message. Could you please try again?",
        intent: 'Unknown',
        entities: []
      };
    }
  }

  private async buildConversationContext(
    userInput: string,
    conversationId: string,
    userId: string
  ): Promise<ConversationContext> {
    // Get conversation history
    const history = await conversationMemory.getConversationHistory(conversationId, 20);

    // Get user preferences
    const userPreferences = await conversationMemory.getUserPreferences(userId) || undefined;

    // Get recent tasks for context
    const recentTasks = await taskManager.getTasks({
      userId,
      completed: false
    }).then(tasks => tasks.slice(0, 5));

    // Get relevant knowledge based on user input (simple keyword matching)
    const keywords = userInput.toLowerCase().split(' ').filter(word => word.length > 3);
    let relevantKnowledge: KnowledgeEntry[] = [];
    if (keywords.length > 0) {
      relevantKnowledge = await knowledgeBase.searchKnowledge({
        userId,
        tags: keywords,
        limit: 2
      });
    }

    return {
      conversationId,
      userId,
      currentMessage: userInput,
      history,
      userPreferences,
      recentTasks,
      relevantKnowledge
    };
  }

  async setUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    await conversationMemory.saveUserPreferences(userId, preferences);

    // Update AI personality based on user preferences
    if (preferences.preferences?.communicationStyle) {
      this.config.personality.communicationStyle = preferences.preferences.communicationStyle;
    }
  }

  async addKnowledge(userId: string, topic: string, content: string, tags: string[] = [], importance: 'low' | 'medium' | 'high' = 'medium'): Promise<KnowledgeEntry> {
    return await knowledgeBase.addKnowledge({
      topic,
      content,
      tags,
      importance,
      userId
    });
  }

  async getUserTasks(userId: string, completed: boolean = false): Promise<Task[]> {
    return await taskManager.getTasks({ userId, completed });
  }

  async getUserKnowledge(userId: string, topic?: string): Promise<KnowledgeEntry[]> {
    if (topic) {
      return await knowledgeBase.searchKnowledge({ userId, topic });
    }
    return await knowledgeBase.searchKnowledge({ userId });
  }

  async createTask(userId: string, content: string, type: 'Task' | 'Reminder' | 'Alarm' = 'Task', time?: string, tags?: string[]): Promise<Task> {
    return await taskManager.createTask({
      type,
      content,
      time,
      userId,
      conversationId: uuidv4(),
      priority: this.config.preferences.defaultTaskPriority,
      tags
    });
  }

  async getUpcomingReminders(userId: string): Promise<Task[]> {
    return await taskManager.getUpcomingReminders(userId);
  }

  async getTaskStats(userId: string): Promise<{
    total: number;
    completed: number;
    pending: number;
    byType: Record<string, number>;
  }> {
    return await taskManager.getTaskStats(userId);
  }

  // Personality and behavior methods
  getPersonality(): AIAssistantConfig['personality'] {
    return { ...this.config.personality };
  }

  updatePersonality(updates: Partial<AIAssistantConfig['personality']>): void {
    this.config.personality = { ...this.config.personality, ...updates };
  }

  getCapabilities(): AIAssistantConfig['capabilities'] {
    return { ...this.config.capabilities };
  }

  // Context retention helpers
  async summarizeConversation(conversationId: string, userId: string): Promise<string> {
    const messages = await conversationMemory.getConversationHistory(conversationId, 50);

    if (messages.length === 0) {
      return 'No conversation history available.';
    }

    // Create a simple summary based on message count and key topics
    const messageCount = messages.length;
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // Extract common entities and intents
    const entities = [...new Set(messages.flatMap(m => m.entities || []))];
    const intents = [...new Set(messages.map(m => m.intent).filter(Boolean))];

    return `Conversation summary: ${messageCount} total messages (${userMessages.length} from user, ${assistantMessages.length} from assistant). Key topics: ${entities.slice(0, 5).join(', ')}. Main intents: ${intents.slice(0, 3).join(', ')}.`;
  }

  // Enhanced response generation with full context
  async generateContextualResponse(
    userInput: string,
    conversationId: string,
    userId: string
  ): Promise<string> {
    const context = await this.buildConversationContext(userInput, conversationId, userId);

    // Build rich contextual prompt
    let contextualPrompt = `You are ${this.config.personality.name}, an intelligent AI assistant with excellent memory and context retention.

COMMUNICATION STYLE: ${this.config.personality.communicationStyle}
EXPERTISE: ${this.config.personality.expertise.join(', ')}
TRAITS: ${this.config.personality.traits.join(', ')}

USER PREFERENCES:
${context.userPreferences ? JSON.stringify(context.userPreferences, null, 2) : 'No specific preferences set.'}

RECENT CONVERSATION:
${await conversationMemory.formatConversationHistory(context.history.slice(-10))}

ACTIVE TASKS:
${context.recentTasks?.map(t => `- ${t.content} (${t.type})`).join('\n') || 'No active tasks.'}

RELEVANT KNOWLEDGE:
${context.relevantKnowledge?.map(k => `- ${k.topic}: ${k.content.substring(0, 100)}...`).join('\n') || 'No relevant knowledge found.'}

CURRENT USER INPUT: "${userInput}"

Please provide a helpful, contextual response that:
1. References previous conversation when relevant
2. Uses the user's preferred communication style
3. Considers their active tasks and preferences
4. Leverages relevant knowledge when applicable
5. Maintains conversation continuity

Response:`;

    // For now, return a simple contextual response
    // In a full implementation, this would call the AI with the full contextual prompt
    return `I understand you're asking: "${userInput}". Based on our conversation context, I can help you with this while keeping in mind our previous discussion.`;
  }
}

export const aiAssistant = AIAssistant.getInstance();
