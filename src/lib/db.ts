import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// Data storage directory
const DATA_DIR = path.join(process.cwd(), '.data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json')
const MEMORIES_FILE = path.join(DATA_DIR, 'memories.json')

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

// Hash password (simple hashing - use bcrypt in production)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// User management
interface User {
  id: string
  email: string
  password: string // hashed
  name: string
  createdAt: string
}

interface StoredUsers {
  [email: string]: User
}

function getUsersData(): StoredUsers {
  ensureDataDir()
  if (!fs.existsSync(USERS_FILE)) {
    return {}
  }
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function saveUsersData(users: StoredUsers) {
  ensureDataDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

export function createUser(email: string, password: string, name: string): User | null {
  const users = getUsersData()
  
  // Check if user exists
  if (users[email]) {
    return null
  }

  const user: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    email,
    password: hashPassword(password),
    name,
    createdAt: new Date().toISOString(),
  }

  users[email] = user
  saveUsersData(users)
  
  return user
}

export function authenticateUser(email: string, password: string): User | null {
  const users = getUsersData()
  const user = users[email]

  if (!user || user.password !== hashPassword(password)) {
    return null
  }

  return user
}

export function getUserByEmail(email: string): User | null {
  const users = getUsersData()
  return users[email] || null
}

export function getUserById(userId: string): User | null {
  const users = getUsersData()
  const user = Object.values(users).find(u => u.id === userId)
  return user || null
}

// Conversation management
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  userId: string
  title: string
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
  memorized?: boolean
}

interface StoredConversations {
  [conversationId: string]: Conversation
}

function getConversationsData(): StoredConversations {
  ensureDataDir()
  if (!fs.existsSync(CONVERSATIONS_FILE)) {
    return {}
  }
  try {
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function saveConversationsData(conversations: StoredConversations) {
  ensureDataDir()
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2))
}

export function createConversation(userId: string, title: string): Conversation {
  const conversations = getConversationsData()
  
  const conversation: Conversation = {
    id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    title,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  conversations[conversation.id] = conversation
  saveConversationsData(conversations)
  
  return conversation
}

export function getConversationsByUserId(userId: string): Conversation[] {
  const conversations = getConversationsData()
  return Object.values(conversations)
    .filter(conv => conv.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function getConversation(conversationId: string, userId: string): Conversation | null {
  const conversations = getConversationsData()
  const conversation = conversations[conversationId]
  
  if (!conversation || conversation.userId !== userId) {
    return null
  }

  return conversation
}

export function addMessageToConversation(
  conversationId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Conversation | null {
  const conversations = getConversationsData()
  const conversation = conversations[conversationId]

  if (!conversation || conversation.userId !== userId) {
    return null
  }

  const message: ConversationMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
  }

  conversation.messages.push(message)
  conversation.updatedAt = new Date().toISOString()
  
  conversations[conversationId] = conversation
  saveConversationsData(conversations)

  return conversation
}

export function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string
): Conversation | null {
  const conversations = getConversationsData()
  const conversation = conversations[conversationId]

  if (!conversation || conversation.userId !== userId) {
    return null
  }

  conversation.title = title
  conversation.updatedAt = new Date().toISOString()
  
  conversations[conversationId] = conversation
  saveConversationsData(conversations)

  return conversation
}

export function deleteConversation(conversationId: string, userId: string): boolean {
  const conversations = getConversationsData()
  const conversation = conversations[conversationId]

  if (!conversation || conversation.userId !== userId) {
    return false
  }

  delete conversations[conversationId]
  saveConversationsData(conversations)

  return true
}

export function clearAllData() {
  ensureDataDir()
  if (fs.existsSync(USERS_FILE)) {
    fs.unlinkSync(USERS_FILE)
  }
  if (fs.existsSync(CONVERSATIONS_FILE)) {
    fs.unlinkSync(CONVERSATIONS_FILE)
  }
  if (fs.existsSync(MEMORIES_FILE)) {
    fs.unlinkSync(MEMORIES_FILE)
  }
}

// Memory management
export interface MemoryItem {
  id: string
  content: string
  userId: string
  type: 'fact' | 'preference' | 'personal'
  importance: 'low' | 'medium' | 'high'
  createdAt: string
  updatedAt: string
  source?: string
  confidence?: number
}

interface StoredMemories {
  [userId: string]: MemoryItem[]
}

function getMemoriesData(): StoredMemories {
  ensureDataDir()
  if (!fs.existsSync(MEMORIES_FILE)) return {}
  try {
    const data = fs.readFileSync(MEMORIES_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function saveMemoriesData(memories: StoredMemories) {
  ensureDataDir()
  fs.writeFileSync(MEMORIES_FILE, JSON.stringify(memories, null, 2))
}

function normalizeMemoryContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function getMemoriesByUserId(userId: string): MemoryItem[] {
  const all = getMemoriesData()
  return all[userId] || []
}

export function addMemoriesUnique(userId: string, contents: string[], opts?: { type?: MemoryItem['type']; importance?: MemoryItem['importance']; source?: string }): MemoryItem[] {
  const all = getMemoriesData()
  const list = all[userId] || []
  const existingSet = new Set(list.map(m => normalizeMemoryContent(m.content)))

  const now = new Date().toISOString()
  const added: MemoryItem[] = []
  for (const c of contents) {
    const norm = normalizeMemoryContent(c)
    if (!norm || existingSet.has(norm)) continue
    const item: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: c.trim(),
      userId,
      type: opts?.type || 'personal',
      importance: opts?.importance || 'medium',
      createdAt: now,
      updatedAt: now,
      source: opts?.source,
    }
    list.push(item)
    existingSet.add(norm)
    added.push(item)
  }
  all[userId] = list
  saveMemoriesData(all)
  return added
}

export function deleteMemoryById(userId: string, memoryId: string): boolean {
  const all = getMemoriesData()
  const list = all[userId] || []
  const lenBefore = list.length
  const after = list.filter(m => m.id !== memoryId)
  all[userId] = after
  saveMemoriesData(all)
  return after.length < lenBefore
}

export function updateMemory(
  userId: string,
  memoryId: string,
  updates: Partial<Pick<MemoryItem, 'content' | 'type' | 'importance' | 'source' | 'confidence'>>
): { ok: boolean; duplicate?: boolean; updated?: MemoryItem } {
  const all = getMemoriesData()
  const list = all[userId] || []
  const idx = list.findIndex(m => m.id === memoryId)
  if (idx === -1) return { ok: false }

  // If content is changing, maintain uniqueness
  if (typeof updates.content === 'string') {
    const norm = normalizeMemoryContent(updates.content)
    const exists = list.some(m => m.id !== memoryId && normalizeMemoryContent(m.content) === norm)
    if (exists) return { ok: false, duplicate: true }
  }

  const now = new Date().toISOString()
  const current = list[idx]
  const updated: MemoryItem = {
    ...current,
    ...updates,
    updatedAt: now,
  }
  list[idx] = updated
  all[userId] = list
  saveMemoriesData(all)
  return { ok: true, updated }
}

export function markConversationMemorized(conversationId: string, userId: string): void {
  const conversations = getConversationsData()
  const conversation = conversations[conversationId]
  if (!conversation || conversation.userId !== userId) return
  conversation.memorized = true
  conversation.updatedAt = new Date().toISOString()
  conversations[conversationId] = conversation
  saveConversationsData(conversations)
}

export function isConversationMemorized(conversationId: string, userId: string): boolean {
  const conversations = getConversationsData()
  const conversation = conversations[conversationId]
  return !!(conversation && conversation.userId === userId && conversation.memorized)
}
