import type { NextApiRequest, NextApiResponse } from 'next'

type ResponseData = {
  success: boolean
  tasks?: any[]
  message?: string
  error?: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // Prefer token from query, then Authorization header, then body
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined
  const authHeader = req.headers.authorization || ''
  const tokenFromAuth = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined

  if (req.method === 'GET') {
    try {
      const token = tokenFromQuery || tokenFromAuth
      const backendRes = await fetch(`${BACKEND_URL}/api/tasks?token=${encodeURIComponent(token || '')}`)
      const data = await backendRes.json()
      res.status(backendRes.status).json(data)
    } catch (error) {
      console.error('Error fetching tasks:', error)
      // Return empty tasks array if backend is down
      res.status(200).json({ success: true, tasks: [] })
    }
  } else if (req.method === 'POST') {
    try {
      const token = tokenFromQuery || tokenFromAuth || (req.body && req.body.token)
      const body = { ...req.body }
      // Only set token if missing so we don't overwrite a token passed in the body
      if (!body.token && token) {
        body.token = token
      }
      const backendRes = await fetch(`${BACKEND_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await backendRes.json()
      res.status(backendRes.status).json(data)
    } catch (error) {
      console.error('Error creating task:', error)
      res.status(500).json({ success: false, error: 'Failed to create task' })
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' })
  }
}
