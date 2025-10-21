export interface User {
  id: string;
  name: string;
  email: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme: "dark" | "light";
  timezone: string;
  language: string;
  sidebarCollapsed?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  entities?: string[];
  isProcessing?: boolean;
  createdAt: Date;
  userId: string;
  conversationId: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  userId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Task {
  id: string;
  type: "Task" | "Reminder" | "Alarm";
  content: string;
  time?: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  userId: string;
  conversationId?: string;
  createdAt: Date;
  dueDate?: Date;
  tags?: string[];
}

export interface Memory {
  id: string;
  content: string;
  userId: string;
  type: "fact" | "preference" | "personal";
  importance: "low" | "medium" | "high";
  createdAt: Date;
  updatedAt: Date;
  source?: string;
}

export interface ChatResponse {
  response: string;
  intent?: string;
  entities?: string[];
  task?: Task | null;
  conversationId: string;
  userId: string;
  memories?: Memory[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface AuthResponse {
  user: User;
  session: {
    token: string;
    expiresAt: string;
  };
}
