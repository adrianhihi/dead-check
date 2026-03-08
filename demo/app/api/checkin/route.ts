import { NextResponse } from 'next/server'
import { dc, db } from '@/lib/dead-check'

export async function POST(req: Request) {
  const { userId, emergencyEmail, name } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // Seed user with emergency email if provided (InMemoryAdapter doesn't
  // store emergencyEmail via updateCheckin, so we seed first)
  const existing = await db.getUser(userId)
  if (!existing) {
    db.seedUser({
      id: userId,
      emergencyEmail: emergencyEmail || null,
      name: name || userId,
    })
  } else if (emergencyEmail && existing.emergencyEmail !== emergencyEmail) {
    db.seedUser({
      ...existing,
      emergencyEmail,
      name: name || existing.name || userId,
    })
  }

  const result = await dc.checkin(userId)
  return NextResponse.json(result)
}
