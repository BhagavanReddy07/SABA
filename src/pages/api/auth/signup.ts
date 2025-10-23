import type { NextApiRequest, NextApiResponse } from 'next'

interface SignupRequestBody {
  email: string
  password: string
  name: string
  confirmPassword: string
}

interface SignupResponse {
  success: boolean
  user?: {
    id: number
    name: string
    email: string
  }
  session?: {
    token: string
    expiresAt: string
  }
  error?: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SignupResponse>
) {
  if (req.method === 'POST') {
    const { email, password, name, confirmPassword } = req.body as SignupRequestBody

    // Validate input
    if (!email || !password || !name || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required',
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      })
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      })
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match',
      })
    }

    // Forward to backend
    try {
      const backendRes = await fetch(`${BACKEND_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })

      const data = await backendRes.json()

      if (data.success && data.token && data.user) {
        return res.status(backendRes.status).json({
          success: true,
          user: {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
          },
          session: {
            token: data.token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        })
      } else {
        return res.status(backendRes.status).json({
          success: false,
          error: data.message || 'Signup failed',
        })
      }
    } catch (error) {
      console.error('Backend signup error:', error)
      return res.status(500).json({
        success: false,
        error: 'Failed to connect to backend',
      })
    }
  }

  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
  })
}
