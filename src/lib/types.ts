export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  preferences?: UserPreferences;
  isActive: boolean;
  password?: string; // For storing hashed password
};

export type UserPreferences = {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  communicationStyle: 'formal' | 'casual' | 'friendly';
  notifications: boolean;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  intent?: string;
  entities?: string[];
  isProcessing?: boolean;
  userId: string;
  conversationId: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: Date;
  messages: Message[];
  userId: string;
  isActive: boolean;
};

export type Task = {
  id: string;
  type: 'Task' | 'Alarm' | 'Reminder';
  content: string;
  time?: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  userId: string;
  conversationId: string;
  priority: 'low' | 'medium' | 'high';
  tags?: string[];
};

export type Memory = {
  id: string;
  content: string;
  userId: string;
  type: 'personal' | 'preference' | 'fact' | 'conversation_summary';
  importance: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt: Date;
};

export type UserSession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};
