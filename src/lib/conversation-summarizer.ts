import { conversationMemory, ConversationMessage } from './conversation-memory';
import { aiAssistant } from './ai-assistant';

export interface ConversationSummary {
  id: string;
  conversationId: string;
  userId: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  duration: number; // in minutes
  messageCount: number;
  createdAt: Date;
}

export class ConversationSummarizer {
  private static instance: ConversationSummarizer;

  static getInstance(): ConversationSummarizer {
    if (!ConversationSummarizer.instance) {
      ConversationSummarizer.instance = new ConversationSummarizer();
    }
    return ConversationSummarizer.instance;
  }

  async summarizeConversation(
    conversationId: string,
    userId: string,
    messages?: ConversationMessage[]
  ): Promise<ConversationSummary> {
    try {
      // Get messages if not provided
      const conversationMessages = messages || await conversationMemory.getConversationHistory(conversationId, 100);

      if (conversationMessages.length === 0) {
        throw new Error('No messages found for summarization');
      }

      // Analyze conversation
      const analysis = await this.analyzeConversation(conversationMessages);

      // Generate summary using AI
      const summaryText = await this.generateSummaryText(conversationMessages, analysis);

      // Create summary object
      const summary: ConversationSummary = {
        id: `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        conversationId,
        userId,
        summary: summaryText,
        keyPoints: analysis.keyPoints,
        topics: analysis.topics,
        sentiment: analysis.sentiment,
        duration: analysis.duration,
        messageCount: conversationMessages.length,
        createdAt: new Date()
      };

      return summary;
    } catch (error) {
      console.error('Error summarizing conversation:', error);
      throw error;
    }
  }

  private async analyzeConversation(messages: ConversationMessage[]): Promise<{
    keyPoints: string[];
    topics: string[];
    sentiment: 'positive' | 'negative' | 'neutral';
    duration: number;
  }> {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // Extract key points from entities and intents
    const allEntities = messages.flatMap(m => m.entities || []);
    const uniqueEntities = [...new Set(allEntities)];

    const allIntents = messages.map(m => m.intent).filter((intent): intent is string => Boolean(intent));
    const uniqueIntents = [...new Set(allIntents)];

    // Determine topics from entities and intents
    const topics = [...uniqueEntities, ...uniqueIntents].slice(0, 10);

    // Calculate duration
    const timestamps = messages.map(m => new Date(m.timestamp).getTime());
    const duration = timestamps.length > 1 ?
      (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60) : 0;

    // Simple sentiment analysis based on message content
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'love', 'like', 'thanks', 'thank you'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'problem', 'error', 'issue', 'wrong'];

    const allText = messages.map(m => m.content.toLowerCase()).join(' ');
    const positiveCount = positiveWords.reduce((count, word) => count + (allText.split(word).length - 1), 0);
    const negativeCount = negativeWords.reduce((count, word) => count + (allText.split(word).length - 1), 0);

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';

    // Extract key points
    const keyPoints = [
      `Conversation involved ${userMessages.length} user messages and ${assistantMessages.length} assistant responses`,
      ...uniqueEntities.slice(0, 3).map(entity => `Discussed: ${entity}`),
      ...uniqueIntents.slice(0, 2).map(intent => `Intent: ${intent}`)
    ];

    return {
      keyPoints,
      topics,
      sentiment,
      duration: Math.round(duration)
    };
  }

  private async generateSummaryText(messages: ConversationMessage[], analysis: any): Promise<string> {
    // Create a contextual summary based on the conversation flow
    const firstMessage = messages[0]?.content || '';
    const lastMessage = messages[messages.length - 1]?.content || '';

    const topicSummary = analysis.topics.length > 0 ?
      `The conversation covered topics including: ${analysis.topics.slice(0, 5).join(', ')}.` :
      'The conversation covered various topics.';

    const sentimentText = analysis.sentiment !== 'neutral' ?
      `The overall tone was ${analysis.sentiment}. ` : '';

    const durationText = analysis.duration > 0 ?
      `The conversation lasted approximately ${analysis.duration} minutes.` : '';

    return `This conversation started with "${firstMessage.substring(0, 50)}..." and concluded with "${lastMessage.substring(0, 50)}...". ${topicSummary} ${sentimentText}${durationText} Total messages exchanged: ${messages.length}.`;
  }

  async saveConversationSummary(summary: ConversationSummary): Promise<void> {
    try {
      // Save to conversation memory system
      await conversationMemory.saveConversationSummary({
        id: summary.id,
        userId: summary.userId,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        timestamp: summary.createdAt,
        messageCount: summary.messageCount
      });
    } catch (error) {
      console.error('Error saving conversation summary:', error);
    }
  }

  async getConversationSummaries(userId: string): Promise<ConversationSummary[]> {
    try {
      const summaries = await conversationMemory.getConversationSummaries(userId);
      return summaries.map(s => ({
        id: s.id,
        conversationId: '', // Would need to be stored separately
        userId: s.userId,
        summary: s.summary,
        keyPoints: s.keyPoints,
        topics: [], // Would need to be stored separately
        sentiment: 'neutral', // Would need to be stored separately
        duration: 0, // Would need to be stored separately
        messageCount: s.messageCount,
        createdAt: s.timestamp
      }));
    } catch (error) {
      console.error('Error getting conversation summaries:', error);
      return [];
    }
  }

  async generateFollowUpSuggestions(conversationId: string, userId: string): Promise<string[]> {
    try {
      const messages = await conversationMemory.getConversationHistory(conversationId, 20);
      const lastMessages = messages.slice(-5);

      // Analyze recent conversation to suggest follow-ups
      const suggestions: string[] = [];

      // Look for incomplete tasks or questions
      const incompleteTasks = lastMessages.filter(m =>
        m.intent === 'Create Task' && m.content.toLowerCase().includes('remind')
      );

      if (incompleteTasks.length > 0) {
        suggestions.push("Would you like me to set up any reminders for the tasks we discussed?");
      }

      // Look for questions that might need follow-up
      const questions = lastMessages.filter(m =>
        m.content.includes('?') || m.intent === 'Get Information'
      );

      if (questions.length > 0) {
        suggestions.push("Do you have any follow-up questions about what we discussed?");
      }

      // General suggestions based on conversation topics
      const entities = lastMessages.flatMap(m => m.entities || []);
      if (entities.some(e => e.toLowerCase().includes('recipe') || e.toLowerCase().includes('food'))) {
        suggestions.push("Would you like more recipe suggestions or meal planning help?");
      }

      if (entities.some(e => e.toLowerCase().includes('task') || e.toLowerCase().includes('todo'))) {
        suggestions.push("Would you like to review or update your task list?");
      }

      return suggestions.slice(0, 3); // Return top 3 suggestions
    } catch (error) {
      console.error('Error generating follow-up suggestions:', error);
      return [];
    }
  }
}

export const conversationSummarizer = ConversationSummarizer.getInstance();
