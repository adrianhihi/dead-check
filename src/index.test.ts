import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeadCheck, InMemoryAdapter } from './index'

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeadCheck — checkin()', () => {
  it('records a check-in and returns streak 1 for new user', async () => {
    const db = new InMemoryAdapter()
    const dc = new DeadCheck({ silenceDays: 2, notifyFn: vi.fn(), db })

    const result = await dc.checkin('user-1')
    expect(result.streak).toBe(1)
    expect(result.isNew).toBe(true)
  })

  it('increments streak on consecutive check-ins', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({ id: 'user-1', lastCheckin: daysAgo(1), streak: 5 })
    const dc = new DeadCheck({ silenceDays: 2, notifyFn: vi.fn(), db })

    const result = await dc.checkin('user-1')
    expect(result.streak).toBe(6)
    expect(result.isNew).toBe(false)
  })

  it('resets streak if gap is more than 1 day', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({ id: 'user-1', lastCheckin: daysAgo(3), streak: 20 })
    const dc = new DeadCheck({ silenceDays: 2, notifyFn: vi.fn(), db })

    const result = await dc.checkin('user-1')
    expect(result.streak).toBe(1)
  })

  it('calls onCheckin hook', async () => {
    const db = new InMemoryAdapter()
    const onCheckin = vi.fn()
    const dc = new DeadCheck({ silenceDays: 2, notifyFn: vi.fn(), db, onCheckin })

    await dc.checkin('user-1')
    expect(onCheckin).toHaveBeenCalledWith('user-1', expect.objectContaining({ streak: 1 }))
  })
})

describe('DeadCheck — runCheck()', () => {
  it('notifies users who have been silent for silenceDays', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({ id: 'user-1', emergencyEmail: 'contact@example.com', lastCheckin: daysAgo(3), streak: 5 })
    db.seedUser({ id: 'user-2', emergencyEmail: 'other@example.com',   lastCheckin: daysAgo(1), streak: 2 })

    const notifyFn = vi.fn().mockResolvedValue(undefined)
    const dc = new DeadCheck({ silenceDays: 2, notifyFn, db })

    const result = await dc.runCheck()

    expect(result.notified).toBe(1)
    expect(notifyFn).toHaveBeenCalledOnce()
    expect(notifyFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', emergencyEmail: 'contact@example.com' })
    )
  })

  it('skips users with no emergency email', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({ id: 'user-1', emergencyEmail: null, lastCheckin: daysAgo(5), streak: 1 })

    const notifyFn = vi.fn()
    const dc = new DeadCheck({ silenceDays: 2, notifyFn, db })

    const result = await dc.runCheck()
    expect(result.notified).toBe(0)
    expect(notifyFn).not.toHaveBeenCalled()
  })

  it('does not re-notify if notifyOnce is true and notifiedAt is recent', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({
      id: 'user-1', emergencyEmail: 'contact@example.com',
      lastCheckin: daysAgo(5), streak: 1,
      notifiedAt: daysAgo(1),   // notified yesterday
    })

    const notifyFn = vi.fn()
    const dc = new DeadCheck({ silenceDays: 2, notifyOnce: true, renotifyAfterDays: 7, notifyFn, db })

    const result = await dc.runCheck()
    expect(result.notified).toBe(0)
  })

  it('re-notifies after renotifyAfterDays has passed', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({
      id: 'user-1', emergencyEmail: 'contact@example.com',
      lastCheckin: daysAgo(10), streak: 1,
      notifiedAt: daysAgo(8),   // notified 8 days ago
    })

    const notifyFn = vi.fn().mockResolvedValue(undefined)
    const dc = new DeadCheck({ silenceDays: 2, notifyOnce: true, renotifyAfterDays: 7, notifyFn, db })

    const result = await dc.runCheck()
    expect(result.notified).toBe(1)
  })

  it('counts errors when notifyFn throws', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({ id: 'user-1', emergencyEmail: 'contact@example.com', lastCheckin: daysAgo(3), streak: 1 })

    const notifyFn = vi.fn().mockRejectedValue(new Error('SMTP error'))
    const dc = new DeadCheck({ silenceDays: 2, notifyFn, db })

    const result = await dc.runCheck()
    expect(result.errors).toBe(1)
    expect(result.notified).toBe(0)
  })
})

describe('DeadCheck — getUser()', () => {
  it('returns null for unknown user', async () => {
    const dc = new DeadCheck({ silenceDays: 2, notifyFn: vi.fn() })
    const result = await dc.getUser('unknown')
    expect(result).toBeNull()
  })

  it('returns isSilent: true for silent user', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({ id: 'user-1', lastCheckin: daysAgo(4), streak: 3 })
    const dc = new DeadCheck({ silenceDays: 2, notifyFn: vi.fn(), db })

    const status = await dc.getUser('user-1')
    expect(status?.isSilent).toBe(true)
    expect(status?.daysSinceLast).toBeGreaterThanOrEqual(4)
  })

  it('returns isSilent: false for active user', async () => {
    const db = new InMemoryAdapter()
    db.seedUser({ id: 'user-1', lastCheckin: new Date(), streak: 7 })
    const dc = new DeadCheck({ silenceDays: 2, notifyFn: vi.fn(), db })

    const status = await dc.getUser('user-1')
    expect(status?.isSilent).toBe(false)
  })
})
