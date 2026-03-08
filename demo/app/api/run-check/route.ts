import { NextResponse } from 'next/server'
import { dc, notificationLog } from '@/lib/dead-check'

export async function POST() {
  const result = await dc.runCheck()
  return NextResponse.json({ ...result, notifications: notificationLog })
}
