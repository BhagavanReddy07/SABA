import type { NextApiRequest, NextApiResponse } from 'next'

interface ResetResponse {
  success: boolean
  message: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResetResponse>
) {
  if (req.method === 'POST') {
    // This endpoint is just for debugging - it tells the frontend to reset
    return res.status(200).json({
      success: true,
      message: 'Frontend should clear localStorage and refresh',
    })
  }

  return res.status(405).json({
    success: false,
    message: 'Method not allowed',
  })
}
