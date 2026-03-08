import { NextResponse } from 'next/server'
import { db } from '@/lib/dead-check'

export async function POST(req: Request) {
  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const existing = await db.getUser(userId)
  if (!existing) {
    return NextResponse.json({ error: 'User not found. Check in first.' }, { status: 404 })
  }

  // Set lastCheckin to 3 days ago
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  threeDaysAgo.setHours(0, 0, 0, 0)

  db.seedUser({
    ...existing,
    lastCheckin: threeDaysAgo,
  })

  return NextResponse.json({ ok: true, lastCheckin: threeDaysAgo.toISOString() })
}
