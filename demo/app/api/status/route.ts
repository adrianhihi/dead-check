import { NextResponse } from 'next/server'
import { dc, notificationLog } from '@/lib/dead-check'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const status = await dc.getUser(userId)
  return NextResponse.json({ status, notifications: notificationLog })
}
