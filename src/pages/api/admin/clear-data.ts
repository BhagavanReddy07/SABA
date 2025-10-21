import type { NextApiRequest, NextApiResponse } from 'next'
import { clearAllData } from '@/lib/db'

interface AdminResponse {
  success: boolean
  message?: string
  error?: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminResponse>
) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Not available in production',
    })
  }

  if (req.method === 'POST') {
    const { action } = req.body

    if (action === 'clear-all-data') {
      clearAllData()
      return res.status(200).json({
        success: true,
        message: 'All data cleared successfully',
      })
    }

    res.status(400).json({
      success: false,
      error: 'Invalid action',
    })
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' })
  }
}
