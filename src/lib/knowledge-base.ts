import redisClient from './redis';

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  tags: string[];
  importance: 'low' | 'medium' | 'high';
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  source?: string;
  verified?: boolean;
}

export interface KnowledgeQuery {
  topic?: string;
  tags?: string[];
  userId?: string;
  importance?: 'low' | 'medium' | 'high';
  limit?: number;
}

export class KnowledgeBase {
  private static instance: KnowledgeBase;

  static getInstance(): KnowledgeBase {
    if (!KnowledgeBase.instance) {
      KnowledgeBase.instance = new KnowledgeBase();
    }
    return KnowledgeBase.instance;
  }

  async addKnowledge(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry> {
    const knowledgeEntry: KnowledgeEntry = {
      id: `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...entry,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      // Save knowledge entry
      const entryKey = `knowledge:${knowledgeEntry.id}`;
      await redisClient.setEx(entryKey, 90 * 24 * 60 * 60, JSON.stringify(knowledgeEntry)); // 90 days

      // Add to user's knowledge base
      if (knowledgeEntry.userId) {
        const userKbKey = `user:knowledge:${knowledgeEntry.userId}`;
        await redisClient.lPush(userKbKey, knowledgeEntry.id);
        await redisClient.expire(userKbKey, 90 * 24 * 60 * 60);

        // Add to topic index
        const topicKey = `knowledge:topic:${knowledgeEntry.topic}:${knowledgeEntry.userId}`;
        await redisClient.lPush(topicKey, knowledgeEntry.id);
        await redisClient.expire(topicKey, 90 * 24 * 60 * 60);

        // Add to tag indices
        for (const tag of knowledgeEntry.tags) {
          const tagKey = `knowledge:tag:${tag}:${knowledgeEntry.userId}`;
          await redisClient.lPush(tagKey, knowledgeEntry.id);
          await redisClient.expire(tagKey, 90 * 24 * 60 * 60);
        }
      }

      console.log('Knowledge entry added:', knowledgeEntry);
      return knowledgeEntry;
    } catch (error) {
      console.error('Error adding knowledge entry:', error);
      throw error;
    }
  }

  async getKnowledge(entryId: string): Promise<KnowledgeEntry | null> {
    try {
      const entryKey = `knowledge:${entryId}`;
      const entryData = await redisClient.get(entryKey);

      if (entryData) {
        return JSON.parse(entryData);
      }
      return null;
    } catch (error) {
      console.error('Error getting knowledge entry:', error);
      return null;
    }
  }

  async searchKnowledge(query: KnowledgeQuery): Promise<KnowledgeEntry[]> {
    try {
      let entryIds: string[] = [];

      if (query.userId) {
        // Get user's knowledge base
        const userKbKey = `user:knowledge:${query.userId}`;
        entryIds = await redisClient.lRange(userKbKey, 0, -1);

        // Filter by topic if specified
        if (query.topic) {
          const topicKey = `knowledge:topic:${query.topic}:${query.userId}`;
          const topicIds = await redisClient.lRange(topicKey, 0, -1);
          entryIds = entryIds.filter(id => topicIds.includes(id));
        }

        // Filter by tags if specified
        if (query.tags && query.tags.length > 0) {
          const tagIds: string[] = [];
          for (const tag of query.tags) {
            const tagKey = `knowledge:tag:${tag}:${query.userId}`;
            const ids = await redisClient.lRange(tagKey, 0, -1);
            tagIds.push(...ids);
          }
          // Find intersection of all tag results
          const tagIdCounts = tagIds.reduce((acc, id) => {
            acc[id] = (acc[id] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          entryIds = entryIds.filter(id => tagIdCounts[id] === query.tags!.length);
        }
      }

      if (entryIds.length === 0) {
        return [];
      }

      const entries: KnowledgeEntry[] = [];
      for (const entryId of entryIds) {
        const entry = await this.getKnowledge(entryId);
        if (entry) {
          // Apply importance filter
          if (query.importance && entry.importance !== query.importance) {
            continue;
          }
          entries.push(entry);
        }
      }

      // Sort by importance and update date
      return entries.sort((a, b) => {
        const importanceOrder = { high: 3, medium: 2, low: 1 };
        const importanceDiff = importanceOrder[b.importance] - importanceOrder[a.importance];
        if (importanceDiff !== 0) return importanceDiff;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }).slice(0, query.limit || 50);
    } catch (error) {
      console.error('Error searching knowledge base:', error);
      return [];
    }
  }

  async updateKnowledge(entryId: string, updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'userId'>>): Promise<KnowledgeEntry | null> {
    try {
      const existingEntry = await this.getKnowledge(entryId);
      if (!existingEntry) {
        return null;
      }

      const updatedEntry: KnowledgeEntry = {
        ...existingEntry,
        ...updates,
        updatedAt: new Date(),
      };

      const entryKey = `knowledge:${entryId}`;
      await redisClient.setEx(entryKey, 90 * 24 * 60 * 60, JSON.stringify(updatedEntry));

      return updatedEntry;
    } catch (error) {
      console.error('Error updating knowledge entry:', error);
      return null;
    }
  }

  async deleteKnowledge(entryId: string): Promise<boolean> {
    try {
      const entry = await this.getKnowledge(entryId);
      if (!entry) {
        return false;
      }

      // Remove from all indices
      const entryKey = `knowledge:${entryId}`;
      await redisClient.del(entryKey);

      if (entry.userId) {
        const userKbKey = `user:knowledge:${entry.userId}`;
        await redisClient.lRem(userKbKey, 0, entryId);

        const topicKey = `knowledge:topic:${entry.topic}:${entry.userId}`;
        await redisClient.lRem(topicKey, 0, entryId);

        for (const tag of entry.tags) {
          const tagKey = `knowledge:tag:${tag}:${entry.userId}`;
          await redisClient.lRem(tagKey, 0, entryId);
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting knowledge entry:', error);
      return false;
    }
  }

  async getRelatedKnowledge(topic: string, userId: string, limit: number = 5): Promise<KnowledgeEntry[]> {
    return this.searchKnowledge({
      userId,
      topic,
      limit
    });
  }

  async getKnowledgeByTags(tags: string[], userId: string, limit: number = 10): Promise<KnowledgeEntry[]> {
    return this.searchKnowledge({
      userId,
      tags,
      limit
    });
  }

  async getImportantKnowledge(userId: string, limit: number = 20): Promise<KnowledgeEntry[]> {
    return this.searchKnowledge({
      userId,
      importance: 'high',
      limit
    });
  }
}

export const knowledgeBase = KnowledgeBase.getInstance();
