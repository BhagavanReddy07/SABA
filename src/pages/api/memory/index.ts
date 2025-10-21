import type { NextApiRequest, NextApiResponse } from 'next'
import { getMemoriesByUserId, addMemoriesUnique, deleteMemoryById, updateMemory } from '@/lib/db'

interface ResponseData {
  success: boolean
  memories?: any[]
  added?: any[]
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

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' })

  if (req.method === 'GET') {
    const memories = getMemoriesByUserId(userId)
    return res.status(200).json({ success: true, memories })
  }

  if (req.method === 'POST') {
    const { contents, type, importance, source } = req.body as { contents: string[]; type?: 'fact'|'preference'|'personal'; importance?: 'low'|'medium'|'high'; source?: string }
    if (!Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({ success: false, error: 'contents[] required' })
    }
    const added = addMemoriesUnique(userId, contents, { type, importance, source })
    return res.status(200).json({ success: true, added })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'id query param required' })
    }
    const ok = deleteMemoryById(userId, id)
    return res.status(ok ? 200 : 404).json({ success: ok, error: ok ? undefined : 'Not found' })
  }

  if (req.method === 'PATCH') {
    const { id, content, type, importance, source, confidence } = req.body as any
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'id required' })
    }
    const result = updateMemory(userId, id, { content, type, importance, source, confidence })
    if (!result.ok && result.duplicate) {
      return res.status(409).json({ success: false, error: 'Duplicate memory content' })
    }
    if (!result.ok) {
      return res.status(404).json({ success: false, error: 'Not found' })
    }
    return res.status(200).json({ success: true, memories: [result.updated] as any })
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' })
}
