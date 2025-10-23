import type { NextApiRequest, NextApiResponse } from 'next'

type ResponseData = {
  success: boolean
  message?: string
  error?: string
}

// Default to IPv4 loopback to avoid Windows/IPv6 (::1) connect refusals when
// the backend is bound only on 127.0.0.1
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // Normalize id which can be string | string[] in Next.js
  const rawId = req.query.id
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  // Accept token from query or Authorization header
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined
  const authHeader = req.headers.authorization || ''
  const headerToken = typeof req.headers.token === 'string' ? (req.headers.token as string) : undefined
  const token = tokenFromQuery || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined) || headerToken

  if (!id || !token) {
    res.status(400).json({ success: false, error: 'Missing id or token' })
    return
  }

  try {
    if (req.method === 'PATCH') {
      const backendRes = await fetch(`${BACKEND_URL}/api/tasks/${id}?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      })
      const data = await backendRes.json()
      res.status(backendRes.status).json(data)
    } else if (req.method === 'DELETE') {
      const backendRes = await fetch(`${BACKEND_URL}/api/tasks/${id}?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
      })
      const data = await backendRes.json()
      res.status(backendRes.status).json(data)
    } else {
      res.status(405).json({ success: false, error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Error processing task:', error)
    res.status(500).json({ success: false, error: 'Failed to process task' })
  }
}
