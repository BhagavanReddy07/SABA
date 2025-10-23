import type { NextApiRequest, NextApiResponse } from 'next'

type ResponseData = {
  success: boolean
  message?: string
  error?: string
  to?: string
  task?: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method === 'POST') {
    try {
      const { to_email, task_title, task_notes, task_time, token } = req.body

      // Call the backend endpoint
      const backendRes = await fetch(`${BACKEND_URL}/api/send-task-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email,
          task_title,
          task_notes,
          task_time,
          token,
        }),
      })

      const data = await backendRes.json()

      if (backendRes.ok) {
        console.log('✅ Email sent successfully:', data)
        res.status(200).json({
          success: true,
          message: data.message || 'Email sent successfully',
          to: to_email,
          task: task_title,
        })
      } else {
        console.error('❌ Backend email error:', data)
        res.status(backendRes.status).json({
          success: false,
          error: data.detail || 'Failed to send email',
        })
      }
    } catch (error) {
      console.error('Error sending email:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to send email - backend unavailable',
      })
    }
  } else {
    res.status(405).json({ success: false, error: 'Method not allowed' })
  }
}
