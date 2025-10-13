import { Pinecone } from '@pinecone-database/pinecone';

interface PineconeConfig {
  apiKey: string;
  indexName: string;
  dimension?: number;
}

export interface ConversationContext {
  id: string;
  content: string;
  metadata: {
    conversationId: string;
    userId: string;
    timestamp: string;
    messageType: 'user' | 'assistant';
    entities?: string[];
    intent?: string;
  };
  score?: number;
}

export class PineconeService {
  private static instance: PineconeService;
  private pinecone: Pinecone | null = null;
  private indexName: string;
  private dimension: number;

  constructor(config: PineconeConfig) {
    this.indexName = config.indexName;
    this.dimension = config.dimension || 1536; // Default dimension for text-embedding-ada-002

    if (config.apiKey) {
      this.pinecone = new Pinecone({
        apiKey: config.apiKey,
      });
    }
  }

  static getInstance(config?: PineconeConfig): PineconeService {
    if (!PineconeService.instance) {
      if (!config) {
        throw new Error('PineconeService must be initialized with config');
      }
      PineconeService.instance = new PineconeService(config);
    }
    return PineconeService.instance;
  }

  async initialize(): Promise<void> {
    if (!this.pinecone) {
      throw new Error('Pinecone client not initialized');
    }

    try {
      // Check if index exists, create if it doesn't
      const indexList = await this.pinecone.listIndexes();
      const indexExists = indexList.indexes?.some(index => index.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: this.dimension,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        console.log(`Pinecone index ${this.indexName} created successfully`);
      } else {
        console.log(`Pinecone index ${this.indexName} already exists`);
      }
    } catch (error) {
      console.error('Error initializing Pinecone:', error);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // For now, we'll use a simple hash-based embedding
    // In production, you would use OpenAI's embedding API or similar
    const hash = this.simpleHash(text);
    const embedding = new Array(this.dimension).fill(0);

    // Create a simple deterministic embedding based on text content
    for (let i = 0; i < text.length && i < this.dimension; i++) {
      embedding[i] = (text.charCodeAt(i) % 100) / 100;
    }

    // Add some hash-based variation
    for (let i = 0; i < Math.min(text.length, 10); i++) {
      const hashIndex = Math.abs(hash + i) % this.dimension;
      embedding[hashIndex] = (embedding[hashIndex] + (text.charCodeAt(i) % 50) / 100) / 2;
    }

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  async storeConversationContext(context: ConversationContext): Promise<void> {
    if (!this.pinecone) {
      console.warn('Pinecone not initialized, skipping context storage');
      return;
    }

    try {
      const index = this.pinecone.index(this.indexName);
      const embedding = await this.generateEmbedding(context.content);

      await index.upsert([{
        id: context.id,
        values: embedding,
        metadata: context.metadata
      }]);

      console.log(`Stored conversation context: ${context.id}`);
    } catch (error) {
      console.error('Error storing conversation context:', error);
      throw error;
    }
  }

  async searchSimilarContexts(
    query: string,
    userId: string,
    topK: number = 5
  ): Promise<ConversationContext[]> {
    if (!this.pinecone) {
      console.warn('Pinecone not initialized, returning empty results');
      return [];
    }

    try {
      const index = this.pinecone.index(this.indexName);
      const queryEmbedding = await this.generateEmbedding(query);

      const queryResponse = await index.query({
        vector: queryEmbedding,
        filter: {
          userId: userId
        },
        topK: topK,
        includeMetadata: true,
        includeValues: false
      });

      return queryResponse.matches?.map(match => ({
        id: match.id,
        content: '', // We don't store the original content in metadata
        metadata: match.metadata as ConversationContext['metadata'],
        score: match.score
      })) || [];
    } catch (error) {
      console.error('Error searching similar contexts:', error);
      return [];
    }
  }

  async deleteConversationContexts(conversationId: string): Promise<void> {
    if (!this.pinecone) {
      return;
    }

    try {
      const index = this.pinecone.index(this.indexName);

      // Delete all vectors for this conversation
      await index.deleteMany({
        conversationId: conversationId
      });

      console.log(`Deleted contexts for conversation: ${conversationId}`);
    } catch (error) {
      console.error('Error deleting conversation contexts:', error);
    }
  }

  async getIndexStats(): Promise<any> {
    if (!this.pinecone) {
      return null;
    }

    try {
      const index = this.pinecone.index(this.indexName);
      return await index.describeIndexStats();
    } catch (error) {
      console.error('Error getting index stats:', error);
      return null;
    }
  }
}

// Initialize Pinecone service
let pineconeService: PineconeService | null = null;

export function initializePinecone(): PineconeService {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME || 'saba-conversations';

  if (!apiKey) {
    console.warn('PINECONE_API_KEY not found, vector search will be disabled');
    return new PineconeService({ apiKey: '', indexName });
  }

  pineconeService = PineconeService.getInstance({
    apiKey,
    indexName,
    dimension: 1536
  });

  return pineconeService;
}

export function getPineconeService(): PineconeService | null {
  return pineconeService;
}
