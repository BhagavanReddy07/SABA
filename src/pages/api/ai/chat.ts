import type { NextApiRequest, NextApiResponse } from 'next'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  getConversation,
  getConversationsByUserId,
  addMessageToConversation,
  updateConversationTitle,
  createConversation,
} from '@/lib/db'

interface ChatRequestBody {
  message: string
  conversationId?: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

// Helper to get user ID from token
function getUserIdFromToken(token?: string): string | null {
  if (!token) return null
  try {
    const clean = token.replace(/^Bearer\s+/i, '')

    // Prefer JWT payload parsing (header.payload.signature)
    const parts = clean.split('.')
    if (parts.length === 3) {
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const pad = payloadB64.length % 4 === 0 ? '' : '='.repeat(4 - (payloadB64.length % 4))
      const json = Buffer.from(payloadB64 + pad, 'base64').toString('utf-8')
      const payload = JSON.parse(json)
      return payload.sub || payload.id || null
    }

    // Fallback: legacy base64-encoded JSON token
    const decoded = JSON.parse(Buffer.from(clean, 'base64').toString('utf-8'))
    return decoded.sub || decoded.id || null
  } catch (error) {
    console.error('Token parsing error:', error)
    return null
  }
}

async function generateResponseWithGemini(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  allUserConversations: any[] = []
): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set in .env.local')
    }

    const client = new GoogleGenerativeAI(apiKey)
    
    // Build a summary of all past conversations for context
    let conversationsSummary = ""
    if (allUserConversations.length > 0) {
      conversationsSummary = "\n\n--- MEMORY OF ALL PAST CONVERSATIONS ---\n"
      allUserConversations.forEach((conv: any, index: number) => {
        if (conv.messages && conv.messages.length > 0) {
          conversationsSummary += `\nConversation ${index + 1}: "${conv.title}"\n`
          conv.messages.slice(-5).forEach((msg: any) => { // Last 5 messages per conversation
            conversationsSummary += `${msg.role === 'user' ? 'User' : 'SABA'}: ${msg.content}\n`
          })
        }
      })
      conversationsSummary += "\n--- END OF MEMORY ---\n"
    }
    
    // Use gemini-2.0-flash which is the latest stable model
    const model = client.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
  systemInstruction: `You are SABA, a professional AI assistant.

Style and tone guidelines:
- Be concise, clear, and helpful. Prefer short paragraphs over long lists.
- Avoid heavy markdown formatting such as bold (**…**) and excessive lists.
- If a list is truly useful, cap to 5 items; otherwise prefer 1–3 short paragraphs.
- Use the user's name sparingly and not in every reply.
- No emojis or filler.

Memory and continuity:
- Retain context across all conversations and reference it only when it improves the answer.

Length budget:
- Keep responses compact: aim for roughly 6–12 lines on desktop unless the user asks for more detail.

${conversationsSummary}

Respond professionally and focus on what solves the user's need with minimal fluff and minimal formatting.`
    })

    // Build conversation context for current chat - use all available history
    const history = conversationHistory
      .slice(-20) // Use last 20 messages for current chat context
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }))

    // Start a chat session with history
    const chat = model.startChat({
      history,
    })

    // Send the new message and get response
    const result = await chat.sendMessage(userMessage)
    const response = await result.response
    const text = response.text()

    return text || 'No response generated'
  } catch (error: any) {
    console.error('Gemini API error:', error)

    if (error?.message?.includes('API key')) {
      return "There's an issue with the Gemini API key. Make sure GEMINI_API_KEY is set in your .env.local file."
    }

    if (process.env.NODE_ENV === 'development') {
      return `I encountered an error: ${error?.message || 'Unknown error'}. Please check the server logs for more details.`
    }

    return 'I encountered a temporary issue. Please try again in a moment.'
  }
}


// Quick natural-language reminder/task parser (very simple, on-purpose)
function parseReminderIntent(text: string): { intent: 'reminder' | null; content?: string; dueDateISO?: string } {
  const lower = text.toLowerCase()
  const intent = /\b(remind|reminder|todo|task|remember)\b/.test(lower) ? 'reminder' : null
  if (!intent) return { intent }

  // naive time parse: look for patterns like 'at 10 45 pm', 'at 10:45 pm', 'today at 6pm'
  // defer to Date parsing for common formats
  let due: Date | null = null

  // Helper: parse simple time expressions like "10 45 pm", "10:45pm", "6pm"
  const parseSimpleTime = (s: string): { hours: number; minutes: number } | null => {
    const m = s.match(/\b(\d{1,2})(?:[:\.\s](\d{2}))?\s*(am|pm)?\b/i)
    if (!m) return null
    let hours = parseInt(m[1], 10)
    const minutes = m[2] ? parseInt(m[2], 10) : 0
    const ampm = m[3]?.toLowerCase()
    if (ampm === 'pm' && hours < 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0
    return { hours, minutes }
  }

  // const containsToday = /\btoday\b/.test(lower) // reserved for future use

  // Try pattern after ' at '
  const atIdx = lower.indexOf(' at ')
  if (atIdx !== -1) {
    const after = text.slice(atIdx + 4).trim()
    const candidate = after.split(/[\.!\?\n]/)[0].trim()
    // If 'today' present anywhere, build a Date for today + parsed time
    const timeParts = parseSimpleTime(candidate)
    if (timeParts) {
      const base = new Date()
      base.setSeconds(0, 0)
      base.setHours(timeParts.hours, timeParts.minutes, 0, 0)
      due = base
    } else {
      const parsed = new Date(candidate)
      if (!isNaN(parsed.getTime())) due = parsed
    }
  }

  // If still no due, try full-text parse or simple time with assumed today
  if (!due) {
    const parsed = new Date(text)
    if (!isNaN(parsed.getTime())) {
      due = parsed
    } else {
      const timeParts = parseSimpleTime(text)
      if (timeParts) {
        const base = new Date()
        base.setSeconds(0, 0)
        base.setHours(timeParts.hours, timeParts.minutes, 0, 0)
        due = base
      }
    }
  }

  // default: if said 'today' and time-like tokens exist but Date failed, try today 20:00 etc. Skip for now.

  // Extract content after 'remind me to' if present
  let content = text
  const m = /remind\s+me\s+to\s+(.+?)(?:\s+at\s+.+)?$/i.exec(text)
  if (m && m[1]) content = m[1].trim()

  return {
    intent,
    content,
    dueDateISO: due ? due.toISOString() : undefined,
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)

    if (!userId) {
      console.error('Unauthorized: No valid user ID from token')
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }

    const { message, conversationId } = req.body as ChatRequestBody

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' })
    }

    try {
      let convId: string | undefined = conversationId
      let conversation

      // Try to get existing conversation if ID is provided
      if (convId) {
        conversation = getConversation(convId, userId)
      }

      // Create new conversation if it doesn't exist
      if (!conversation) {
        const title = message.substring(0, 50)
        const newConv = createConversation(userId, title)
        convId = newConv.id
        conversation = newConv
        console.log('Created new conversation:', convId)
      } else {
        console.log('Using existing conversation:', convId)
      }

      // Get conversation history
      const history = conversation.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }))

      // Get all user conversations for complete context memory
      const allUserConversations = getConversationsByUserId(userId)
        .filter(conv => conv.id !== convId) // Exclude current conversation from summary

      console.log('Sending to Gemini with history length:', history.length, 'and', allUserConversations.length, 'other conversations')
      // Detect reminder/task intent; if found, attempt to create task via backend
      const parsed = parseReminderIntent(message)

      let createdTask: any = null
      let aiResponse: string

      if (parsed.intent === 'reminder') {
        try {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
          const createRes = await fetch(`${backendUrl}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              content: parsed.content || message,
              type: 'Reminder',
              priority: 'medium',
              completed: false,
              dueDate: parsed.dueDateISO, // may be undefined
              tags: ['auto-from-chat'],
            }),
          })
          const createData = await createRes.json()
          if (createRes.ok && createData?.success) {
            createdTask = createData.task || null
            aiResponse = `Okay, I've created a reminder for you.${parsed.dueDateISO ? ` I'll remind you at ${new Date(parsed.dueDateISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''}`
          } else {
            aiResponse = `I tried to create a reminder but the server responded with an error${createData?.error ? `: ${createData.error}` : '.'}`
          }
        } catch (e: any) {
          aiResponse = `I couldn't reach the task service to create a reminder. ${e?.message || ''}`.trim()
        }
      } else {
        // Generate response using Gemini API with all conversation context
        aiResponse = await generateResponseWithGemini(message, history, allUserConversations)
      }

      // Add user message to database
      if (!convId) throw new Error('Conversation ID not set')
      addMessageToConversation(convId, userId, 'user', message)

  // Add assistant message to database
  addMessageToConversation(convId, userId, 'assistant', aiResponse)

      // Update title if this is the first exchange
      if (conversation.messages.length === 0) {
        const title = message.substring(0, 50)
        updateConversationTitle(convId, userId, title)
      }

      res.status(200).json({
        success: true,
        response: aiResponse,
        conversationId: convId,
        task: createdTask,
      })
    } catch (error) {
      console.error('Chat error:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to generate response',
      })
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' })
  }
}

export default handler

