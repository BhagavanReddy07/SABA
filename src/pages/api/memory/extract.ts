import type { NextApiRequest, NextApiResponse } from 'next'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  getConversation,
  isConversationMemorized,
  markConversationMemorized,
  addMemoriesUnique,
} from '@/lib/db'

interface ResponseData {
  success: boolean
  added?: any[]
  skipped?: boolean
  error?: string
}

function getUserIdFromToken(token?: string): string | null {
  if (!token) return null
  try {
    const clean = token.replace(/^Bearer\s+/i, '')
    const parts = clean.split('.')
    if (parts.length === 3) {
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const pad = payloadB64.length % 4 === 0 ? '' : '='.repeat(4 - (payloadB64.length % 4))
      const json = Buffer.from(payloadB64 + pad, 'base64').toString('utf-8')
      const payload = JSON.parse(json)
      return payload.sub || payload.id || null
    }
    const decoded = JSON.parse(Buffer.from(clean, 'base64').toString('utf-8'))
    return decoded.sub || decoded.id || null
  } catch {
    return null
  }
}

function heuristicExtract(messages: { role: 'user'|'assistant'; content: string }[]): string[] {
  // Simple patterns for personal facts/preferences
  const facts: string[] = []
  const push = (s: string) => {
    const v = s.trim()
    if (v && !facts.includes(v)) facts.push(v)
  }

  for (const m of messages) {
    const text = m.content.toLowerCase()
    // name
    const nameMatch = /\bmy name is\s+([a-z\-\s']{2,})\b/.exec(text)
    if (nameMatch) push(`User's name is ${nameMatch[1].trim()}`)
    // age
    const ageMatch = /\b(i am|i'm|my age is)\s+(\d{1,3})\b/.exec(text)
    if (ageMatch) push(`User's age is ${ageMatch[2]}`)
    // likes/loves
    const likeMatch = /\b(i like|i love|my favorite(?:\s+\w+)?\s+is)\s+([^\.\!\?\n]{2,})/.exec(text)
    if (likeMatch) push(`Preference: ${likeMatch[0].replace(/^(i like|i love)\s+/,'')}`)
    // location
    const locMatch = /\b(i live in|i'm from|my hometown is)\s+([^\.\!\?\n]{2,})/.exec(text)
    if (locMatch) push(`Location: ${locMatch[2].trim()}`)
    // job
    const jobMatch = /\b(i work as|my job is|i am an?|i'm an?)\s+([^\.\!\?\n]{2,})/.exec(text)
    if (jobMatch) push(`Work: ${jobMatch[0].replace(/^(i work as|my job is|i am|i'm)\s+/,'')}`)

    // birthday / DOB (e.g., "my birthday is January 12", "dob is 12/01/1990", "i was born on 1990-05-09")
    const monthName = '(january|february|march|april|may|june|july|august|september|october|november|december)'
    const dob1 = new RegExp(`\\b(my\\s+birthday\\s+is|dob\\s+is|i\\s+was\\s+born\\s+on)\\s+(${monthName}\\s+\\d{1,2}(?:,\\s*\\d{4})?)`) .exec(text)
    if (dob1) push(`Birthday: ${dob1[2]}`)
    const dob2 = /\b(my\s+birthday\s+is|dob\s+is|i\s+was\s+born\s+on)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/.exec(text)
    if (dob2) push(`Birthday: ${dob2[2]}`)
    const dob3 = /\b(i\s+was\s+born\s+on)\s+(\d{4}[\-\.\/]\d{1,2}[\-\.\/]\d{1,2})\b/.exec(text)
    if (dob3) push(`Birthday: ${dob3[2]}`)

    // skills ("i know X", "i'm good at X", "my skills include X, Y", "i'm learning X")
    const skill1 = /\b(i\s+know|i'm\s+good\s+at|i\s+can\s+do)\s+([^\.\!\?\n]{2,})/.exec(text)
    if (skill1) push(`Skill: ${skill1[2].trim()}`)
    const skill2 = /\b(my\s+skills\s+include|i\s+have\s+experience\s+with)\s+([^\.\!\?\n]{2,})/.exec(text)
    if (skill2) push(`Skills: ${skill2[2].trim()}`)
    const skill3 = /\b(i'm\s+learning|i\s+want\s+to\s+learn)\s+([^\.\!\?\n]{2,})/.exec(text)
    if (skill3) push(`Learning: ${skill3[2].trim()}`)

    // goals ("my goal is to", "i want to", "i plan to", "i need to")
    const goal1 = /\b(my\s+goal\s+is\s+to|i\s+want\s+to|i\s+plan\s+to|i\s+need\s+to)\s+([^\.\!\?\n]{3,})/.exec(text)
    if (goal1) push(`Goal: ${goal1[2].trim()}`)
  }

  // Keep it concise and unique
  return Array.from(new Set(facts)).slice(0, 12)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' })

  const { conversationId } = req.body as { conversationId?: string }
  if (!conversationId) return res.status(400).json({ success: false, error: 'conversationId required' })

  // Only once per conversation
  if (isConversationMemorized(conversationId, userId)) {
    return res.status(200).json({ success: true, skipped: true })
  }

  const conv = getConversation(conversationId, userId)
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' })

  const history = conv.messages.map(m => ({ role: m.role, content: m.content }))

  let points: string[] = []

  const apiKey = process.env.GEMINI_API_KEY
  if (apiKey) {
    try {
      const client = new GoogleGenerativeAI(apiKey)
      const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const prompt = `Extract concise personal memory items from the following conversation between a user and an assistant. Focus on profile facts and stable preferences (name, age, likes, location, job, recurring preferences). Return each item as a single bullet line, no numbering, 1 sentence each, max 12 items. Avoid duplicates and trivial chit-chat.\n\n` +
        history.map(h => `${h.role === 'user' ? 'User' : 'SABA'}: ${h.content}`).join('\n')
      const result = await model.generateContent(prompt)
      const text = result.response.text() || ''
      points = text.split(/\n+/).map(s => s.replace(/^[-•\*]\s*/, '').trim()).filter(Boolean)
    } catch (e) {
      // Fall back to heuristics on any API error
      points = heuristicExtract(history)
    }
  } else {
    // No API key, use heuristic extraction
    points = heuristicExtract(history)
  }

  const added = addMemoriesUnique(userId, points, { type: 'personal', importance: 'medium', source: `conversation:${conversationId}` })
  markConversationMemorized(conversationId, userId)

  return res.status(200).json({ success: true, added })
}
