import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteConversation } from '@/lib/db'

interface ResponseData {
  success: boolean
  error?: string
}

// Helper to get user ID from token (same logic as index.ts)
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
  res: NextApiResponse<ResponseData>
) {
  const { id } = req.query
  const convId = Array.isArray(id) ? id[0] : id

  if (!convId) {
    return res.status(400).json({ success: false, error: 'Missing conversation id' })
  }

  const token = req.headers.authorization?.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  if (req.method === 'DELETE') {
    try {
      const ok = deleteConversation(convId, userId)
      if (!ok) {
        return res.status(404).json({ success: false, error: 'Conversation not found' })
      }
      return res.status(200).json({ success: true })
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to delete conversation' })
    }
  }

  res.status(405).json({ success: false, error: 'Method not allowed' })
}
