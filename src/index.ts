// dead-check — core implementation
// A minimal dead man's switch for your app.
// https://github.com/stillemployed/dead-check

export interface DCUser {
  id:                string
  emergencyEmail:    string | null
  lastCheckin:       Date | null
  streak:            number
  notifiedAt:        Date | null
  name?:             string
}

export interface SilentUser extends DCUser {
  daysSinceLast:  number
  emergencyEmail: string   // narrowed — guaranteed non-null when notifying
}

export interface CheckinResult {
  userId:    string
  streak:    number
  isNew:     boolean
  lastSeen:  Date
}

export interface UserStatus {
  userId:        string
  streak:        number
  lastCheckin:   Date | null
  isSilent:      boolean
  daysSinceLast: number
}

export interface CheckResult {
  checked:   number
  silent:    number
  notified:  number
  errors:    number
}

// ── Adapter interface — implement this for any database ──────────────────────

export interface DeadCheckAdapter {
  getUser(userId: string):           Promise<DCUser | null>
  updateCheckin(userId: string):     Promise<DCUser>
  getSilentUsers(since: Date):       Promise<DCUser[]>
  markNotified(userId: string):      Promise<void>
}

// ── In-memory adapter (for testing / prototyping) ────────────────────────────

export class InMemoryAdapter implements DeadCheckAdapter {
  private users = new Map<string, DCUser>()

  async getUser(userId: string) {
    return this.users.get(userId) ?? null
  }

  async updateCheckin(userId: string): Promise<DCUser> {
    const existing = this.users.get(userId)
    const now = new Date()
    const isConsecutive = existing?.lastCheckin
      ? daysBetween(existing.lastCheckin, now) <= 1
      : false

    const updated: DCUser = {
      id:             userId,
      emergencyEmail: existing?.emergencyEmail ?? null,
      notifiedAt:     existing?.notifiedAt ?? null,
      name:           existing?.name,
      lastCheckin:    now,
      streak:         isConsecutive ? (existing?.streak ?? 0) + 1 : 1,
    }
    this.users.set(userId, updated)
    return updated
  }

  async getSilentUsers(since: Date): Promise<DCUser[]> {
    return Array.from(this.users.values()).filter(u =>
      u.emergencyEmail &&
      u.lastCheckin &&
      u.lastCheckin < since
    )
  }

  async markNotified(userId: string): Promise<void> {
    const u = this.users.get(userId)
    if (u) this.users.set(userId, { ...u, notifiedAt: new Date() })
  }

  // Test helper — seed a user
  seedUser(user: Partial<DCUser> & { id: string }) {
    this.users.set(user.id, {
      emergencyEmail: null,
      lastCheckin:    null,
      streak:         0,
      notifiedAt:     null,
      ...user,
    })
  }
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface DeadCheckConfig {
  /** How many days of silence before notifying. Required. */
  silenceDays:         number

  /** Called for each silent user. Bring your own email sender. Required. */
  notifyFn:            (user: SilentUser) => Promise<void>

  /** Database adapter. Defaults to in-memory (good for testing). */
  db?:                 DeadCheckAdapter

  /** Don't re-notify if user was already notified recently. Default: true */
  notifyOnce?:         boolean

  /** Days before re-notifying if user is still silent. Default: 7 */
  renotifyAfterDays?:  number

  /** Timezone for silence calculation. Default: 'UTC' */
  timezone?:           string

  /** Optional hook called after each successful check-in */
  onCheckin?:          (userId: string, result: CheckinResult) => void

  /** Optional hook called after each notification is sent */
  onNotify?:           (user: SilentUser) => void
}

// ── Main class ───────────────────────────────────────────────────────────────

export class DeadCheck {
  private config:      Required<DeadCheckConfig>
  private db:          DeadCheckAdapter

  constructor(config: DeadCheckConfig) {
    this.config = {
      notifyOnce:        true,
      renotifyAfterDays: 7,
      timezone:          'UTC',
      db:                new InMemoryAdapter(),
      onCheckin:         () => {},
      onNotify:          () => {},
      ...config,
    }
    this.db = this.config.db
  }

  /**
   * Record a check-in for a user.
   * Call this from your check-in API endpoint.
   */
  async checkin(userId: string): Promise<CheckinResult> {
    const before = await this.db.getUser(userId)
    const updated = await this.db.updateCheckin(userId)

    const result: CheckinResult = {
      userId,
      streak:   updated.streak,
      isNew:    !before,
      lastSeen: updated.lastCheckin!,
    }

    this.config.onCheckin(userId, result)
    return result
  }

  /**
   * Scan all users and notify emergency contacts for anyone who has gone quiet.
   * Run this daily via cron.
   */
  async runCheck(): Promise<CheckResult> {
    const since   = daysAgo(this.config.silenceDays)
    const silent  = await this.db.getSilentUsers(since)

    let notified = 0
    let errors   = 0

    for (const user of silent) {
      // Skip if no emergency email
      if (!user.emergencyEmail) continue

      // Skip if already notified recently (and notifyOnce is true)
      if (this.config.notifyOnce && user.notifiedAt) {
        const renotifyAfter = daysAgo(this.config.renotifyAfterDays)
        if (user.notifiedAt > renotifyAfter) continue
      }

      const silentUser: SilentUser = {
        ...user,
        emergencyEmail: user.emergencyEmail,
        daysSinceLast:  daysBetween(user.lastCheckin!, new Date()),
      }

      try {
        await this.config.notifyFn(silentUser)
        await this.db.markNotified(user.id)
        this.config.onNotify(silentUser)
        notified++
      } catch (err) {
        errors++
        console.error(`[dead-check] Failed to notify for user ${user.id}:`, err)
      }
    }

    return {
      checked:  silent.length,
      silent:   silent.length,
      notified,
      errors,
    }
  }

  /**
   * Get the current status of a user.
   */
  async getUser(userId: string): Promise<UserStatus | null> {
    const user = await this.db.getUser(userId)
    if (!user) return null

    const daysSinceLast = user.lastCheckin
      ? daysBetween(user.lastCheckin, new Date())
      : Infinity

    return {
      userId:        user.id,
      streak:        user.streak,
      lastCheckin:   user.lastCheckin,
      isSilent:      daysSinceLast >= this.config.silenceDays,
      daysSinceLast: daysSinceLast === Infinity ? -1 : daysSinceLast,
    }
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime())
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
