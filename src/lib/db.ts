import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set in environment');
}

const pool = new Pool({ connectionString });

export default pool;

import type { User, Conversation, Message } from './types';

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params);
  return res;
}

// --- User Functions ---
export async function createUser(user: Omit<User, 'id' | 'createdAt' | 'preferences' | 'isActive'> & { password_hash: string }): Promise<User> {
  const result = await query(
    `INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, NOW()) RETURNING id, email, created_at`,
    [user.email, user.password_hash]
  );
  const newUser = result.rows[0];
  return {
    id: newUser.id,
    email: newUser.email,
    name: user.name, // Name is not stored in users table, need to adjust type or schema
    createdAt: newUser.created_at,
    isActive: true, // Default to true
    password: user.password_hash, // This should not be returned, but for type compatibility
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query('SELECT id, email, password_hash, created_at FROM users WHERE email = $1', [email]);
  if (result.rows.length > 0) {
    const dbUser = result.rows[0];
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: '', // Name is not stored in users table, need to adjust type or schema
      createdAt: dbUser.created_at,
      isActive: true, // Default to true
      password: dbUser.password_hash,
    };
  }
  return null;
}

// --- Conversation Functions ---
export async function saveConversation(conversation: Omit<Conversation, 'messages'>): Promise<Conversation> {
  const result = await query(
    `INSERT INTO conversations (id, user_id, title, created_at, last_updated)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       last_updated = EXCLUDED.last_updated
     RETURNING *`,
    [conversation.id, conversation.userId, conversation.title, conversation.createdAt, new Date()]
  );
  const dbConvo = result.rows[0];
  return {
    id: dbConvo.id,
    userId: dbConvo.user_id,
    title: dbConvo.title,
    createdAt: dbConvo.created_at,
    messages: [], // Messages are fetched separately
    isActive: true, // Default to true
  };
}

export async function getConversationById(conversationId: string): Promise<Conversation | null> {
  const result = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  if (result.rows.length > 0) {
    const dbConvo = result.rows[0];
    return {
      id: dbConvo.id,
      userId: dbConvo.user_id,
      title: dbConvo.title,
      createdAt: dbConvo.created_at,
      messages: [], // Messages are fetched separately
      isActive: true, // Default to true
    };
  }
  return null;
}

export async function getConversationsByUserId(userId: string): Promise<Conversation[]> {
  const result = await query('SELECT * FROM conversations WHERE user_id = $1 ORDER BY last_updated DESC', [userId]);
  return result.rows.map(dbConvo => ({
    id: dbConvo.id,
    userId: dbConvo.user_id,
    title: dbConvo.title,
    createdAt: dbConvo.created_at,
    messages: [], // Messages are fetched separately
    isActive: true, // Default to true
  }));
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await query('DELETE FROM conversations WHERE id = $1', [conversationId]);
}

// --- Message Functions ---
export async function saveMessage(message: Message): Promise<Message> {
  const result = await query(
    `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at, intent, entities)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      message.id,
      message.conversationId,
      message.userId,
      message.role,
      message.content,
      message.createdAt,
      message.intent || null,
      message.entities && message.entities.length > 0 ? JSON.stringify(message.entities) : null, // Store entities as JSON string
    ]
  );
  const dbMessage = result.rows[0];

  let entities: string[] = [];
  try {
    entities = dbMessage.entities ? JSON.parse(dbMessage.entities) : [];
  } catch (error) {
    console.error('Error parsing entities JSON in saveMessage:', error);
    entities = [];
  }

  return {
    id: dbMessage.id,
    conversationId: dbMessage.conversation_id,
    userId: dbMessage.user_id,
    role: dbMessage.role,
    content: dbMessage.content,
    createdAt: dbMessage.created_at,
    intent: dbMessage.intent,
    entities: entities,
    isProcessing: false, // Not persisted
  };
}

export async function getMessagesByConversationId(conversationId: string): Promise<Message[]> {
  const result = await query(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return result.rows.map(dbMessage => {
    let entities: string[] = [];
    try {
      entities = dbMessage.entities ? JSON.parse(dbMessage.entities) : [];
    } catch (error) {
      console.error('Error parsing entities JSON:', error);
      entities = [];
    }

    return {
      id: dbMessage.id,
      conversationId: dbMessage.conversation_id,
      userId: dbMessage.user_id,
      role: dbMessage.role,
      content: dbMessage.content,
      createdAt: dbMessage.created_at,
      intent: dbMessage.intent,
      entities: entities,
      isProcessing: false, // Not persisted
    };
  });
}
