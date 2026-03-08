import { DeadCheck, InMemoryAdapter } from 'dead-check'
import { templates } from 'dead-check/templates'
import type { SilentUser } from 'dead-check'

export interface NotificationLog {
  timestamp: string
  userId: string
  emergencyEmail: string
  subject: string
  body: string
  html: string
}

// Use globalThis to persist state across Next.js dev mode hot reloads
const globalForDemo = globalThis as unknown as {
  __deadCheckDb?: InMemoryAdapter
  __deadCheckDc?: DeadCheck
  __deadCheckNotifications?: NotificationLog[]
}

const db = globalForDemo.__deadCheckDb ?? new InMemoryAdapter()
const notificationLog = globalForDemo.__deadCheckNotifications ?? ([] as NotificationLog[])

const dc = globalForDemo.__deadCheckDc ?? new DeadCheck({
  silenceDays: 2,
  db,
  notifyFn: async (user: SilentUser) => {
    notificationLog.push({
      timestamp: new Date().toISOString(),
      userId: user.id,
      emergencyEmail: user.emergencyEmail,
      subject: templates.warm.subject(user),
      body: templates.warm.text(user),
      html: templates.warm.html(user),
    })
  },
})

globalForDemo.__deadCheckDb = db
globalForDemo.__deadCheckDc = dc
globalForDemo.__deadCheckNotifications = notificationLog

export { dc, db, notificationLog }
