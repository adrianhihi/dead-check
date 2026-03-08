import type { PrismaClient } from '@prisma/client'
import type { DCUser, DeadCheckAdapter } from '../index'

/**
 * Prisma adapter for dead-check.
 *
 * Requires these fields on your User model:
 *
 * ```prisma
 * model User {
 *   id                String    @id @default(cuid())
 *   emergencyEmail    String?
 *   lastCheckin       DateTime?
 *   streak            Int       @default(0)
 *   notifiedAt        DateTime?
 *   name              String?
 *   // ... your other fields
 * }
 * ```
 */
export class PrismaAdapter implements DeadCheckAdapter {
  constructor(private prisma: PrismaClient) {}

  async getUser(userId: string): Promise<DCUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:             true,
        name:           true,
        emergencyEmail: true,
        lastCheckin:    true,
        streak:         true,
        notifiedAt:     true,
      },
    })
    if (!user) return null
    return user as DCUser
  }

  async updateCheckin(userId: string): Promise<DCUser> {
    const existing = await this.getUser(userId)
    const now = new Date()

    // Check if yesterday's check-in exists (for streak continuity)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const isConsecutive = existing?.lastCheckin
      ? existing.lastCheckin >= yesterday
      : false

    const newStreak = isConsecutive ? (existing?.streak ?? 0) + 1 : 1

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastCheckin: now,
        streak:      newStreak,
      },
      select: {
        id:             true,
        name:           true,
        emergencyEmail: true,
        lastCheckin:    true,
        streak:         true,
        notifiedAt:     true,
      },
    })
    return updated as DCUser
  }

  async getSilentUsers(since: Date): Promise<DCUser[]> {
    const users = await this.prisma.user.findMany({
      where: {
        emergencyEmail: { not: null },
        OR: [
          { lastCheckin: { lt: since } },
          { lastCheckin: null },
        ],
      },
      select: {
        id:             true,
        name:           true,
        emergencyEmail: true,
        lastCheckin:    true,
        streak:         true,
        notifiedAt:     true,
      },
    })
    return users as DCUser[]
  }

  async markNotified(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data:  { notifiedAt: new Date() },
    })
  }
}
