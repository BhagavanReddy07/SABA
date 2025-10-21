import type { NextApiRequest, NextApiResponse } from 'next'
import { getConversationsByUserId } from '@/lib/db'

interface ConversationsResponse {
  success: boolean
  conversations?: any[]
  error?: string
}

// Helper to get user ID from token
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

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ConversationsResponse>
) {
  if (req.method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - no token provided',
      })
    }

    const userId = getUserIdFromToken(token)
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - invalid token',
      })
    }

    const conversations = getConversationsByUserId(userId)
      // Normalize messages to include createdAt for the frontend
      .map((conv) => ({
        ...conv,
        messages: Array.isArray(conv.messages)
          ? conv.messages.map((m: any) => ({
              ...m,
              createdAt: m.createdAt || (m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString()),
            }))
          : [],
      }))

    return res.status(200).json({
      success: true,
      conversations,
    })
  }

  res.status(405).json({ success: false, error: 'Method not allowed' })
}
