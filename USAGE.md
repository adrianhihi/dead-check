# dead-check — Usage Guide

Integrate a dead man's switch into your app in under 30 minutes.

---

## Installation

```bash
npm install dead-check
```

```bash
yarn add dead-check
```

```bash
pnpm add dead-check
```

---

## The 5-minute integration

This uses the built-in `InMemoryAdapter` — no database needed.

```typescript
import { DeadCheck } from 'dead-check'

const dc = new DeadCheck({
  silenceDays: 2,
  notifyFn: async (user) => {
    console.log(`ALERT: ${user.name} hasn't checked in for ${user.daysSinceLast} days`)
    console.log(`Notifying ${user.emergencyEmail}`)
  },
})

// 1. User checks in (call this from your API)
const result = await dc.checkin('user-123')
console.log(result)
// { userId: 'user-123', streak: 1, isNew: true, lastSeen: 2024-01-15T... }

// 2. Check for silent users (call this from a daily cron)
const check = await dc.runCheck()
console.log(check)
// { checked: 0, silent: 0, notified: 0, errors: 0 }

// 3. Get user status anytime
const status = await dc.getUser('user-123')
console.log(status)
// { userId: 'user-123', streak: 1, lastCheckin: 2024-01-15T..., isSilent: false, daysSinceLast: 0 }
```

That's the entire API. Two actions (`checkin`, `runCheck`), one query (`getUser`).

---

## Production setup

A complete Next.js integration in 5 steps.

### 1. Add Prisma schema fields

Add these fields to your existing `User` model:

```prisma
model User {
  id              String    @id @default(cuid())
  name            String?
  // ... your existing fields ...

  // dead-check fields:
  emergencyEmail  String?
  lastCheckin     DateTime?
  streak          Int       @default(0)
  notifiedAt      DateTime?
}
```

Run `npx prisma db push` or create a migration.

### 2. Create the singleton

```typescript
// lib/dead-check.ts
import { DeadCheck } from 'dead-check'
import { PrismaAdapter } from 'dead-check/adapters/prisma'
import { templates } from 'dead-check/templates'
import { prisma } from './prisma'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const globalForDC = globalThis as unknown as { dc?: DeadCheck }

export const dc = globalForDC.dc ?? new DeadCheck({
  silenceDays: 2,
  db: new PrismaAdapter(prisma),
  notifyFn: async (user) => {
    await resend.emails.send({
      from: 'noreply@yourapp.com',
      to: user.emergencyEmail,
      subject: templates.warm.subject(user),
      html: templates.warm.html(user),
    })
  },
})

globalForDC.dc = dc
```

### 3. Create the check-in route

```typescript
// app/api/checkin/route.ts
import { dc } from '@/lib/dead-check'
import { getServerSession } from 'next-auth'

export async function POST() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await dc.checkin(session.user.id)
  return Response.json(result)
}
```

### 4. Create the cron route

```typescript
// app/api/cron/dead-check/route.ts
import { dc } from '@/lib/dead-check'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await dc.runCheck()
  return Response.json(result)
}
```

### 5. Set up Vercel Cron

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/dead-check",
    "schedule": "0 9 * * *"
  }]
}
```

```bash
# .env
CRON_SECRET=your-secret-here
RESEND_API_KEY=re_...
```

Done. Users check in → you run the cron daily → silent users' contacts get emailed.

---

## Choosing a notification provider

`notifyFn` is any async function. Use whatever you want.

### Resend (recommended)

```typescript
import { Resend } from 'resend'
import { templates } from 'dead-check/templates'

const resend = new Resend(process.env.RESEND_API_KEY)

const dc = new DeadCheck({
  silenceDays: 2,
  notifyFn: async (user) => {
    await resend.emails.send({
      from: 'noreply@yourapp.com',
      to: user.emergencyEmail,
      subject: templates.warm.subject(user),
      html: templates.warm.html(user),
    })
  },
})
```

### Nodemailer / SMTP

```typescript
import nodemailer from 'nodemailer'
import { templates } from 'dead-check/templates'

const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

const dc = new DeadCheck({
  silenceDays: 2,
  notifyFn: async (user) => {
    await transport.sendMail({
      from: 'noreply@yourapp.com',
      to: user.emergencyEmail,
      subject: templates.minimal.subject(user),
      text: templates.minimal.text(user),
      html: templates.minimal.html(user),
    })
  },
})
```

### SendGrid

```typescript
import sgMail from '@sendgrid/mail'
import { templates } from 'dead-check/templates'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

const dc = new DeadCheck({
  silenceDays: 2,
  notifyFn: async (user) => {
    await sgMail.send({
      from: 'noreply@yourapp.com',
      to: user.emergencyEmail,
      subject: templates.warm.subject(user),
      text: templates.warm.text(user),
      html: templates.warm.html(user),
    })
  },
})
```

### Custom (any async function)

```typescript
const dc = new DeadCheck({
  silenceDays: 2,
  notifyFn: async (user) => {
    // Slack, Discord, SMS, carrier pigeon — anything async
    await fetch('https://hooks.slack.com/services/...', {
      method: 'POST',
      body: JSON.stringify({
        text: `${user.name} hasn't checked in for ${user.daysSinceLast} days`,
      }),
    })
  },
})
```

---

## Configuration reference

| Option | Type | Default | Description |
|---|---|---|---|
| `silenceDays` | `number` | **required** | Days of silence before notifying the emergency contact |
| `notifyFn` | `(user: SilentUser) => Promise<void>` | **required** | Called once per silent user. Bring your own sender |
| `db` | `DeadCheckAdapter` | `InMemoryAdapter` | Database adapter |
| `notifyOnce` | `boolean` | `true` | Don't re-notify if already notified recently |
| `renotifyAfterDays` | `number` | `7` | Days before re-notifying if user is still silent |
| `timezone` | `string` | `'UTC'` | Timezone for silence calculation |
| `onCheckin` | `(userId, result) => void` | no-op | Hook fired after each successful check-in |
| `onNotify` | `(user: SilentUser) => void` | no-op | Hook fired after each successful notification |

All options at once:

```typescript
const dc = new DeadCheck({
  silenceDays: 2,
  notifyFn: async (user) => { await sendEmail(user) },
  db: new PrismaAdapter(prisma),
  notifyOnce: true,
  renotifyAfterDays: 7,
  timezone: 'UTC',
  onCheckin: (userId, result) => {
    console.log(`${userId} checked in — streak ${result.streak}`)
  },
  onNotify: (user) => {
    console.log(`Notified ${user.emergencyEmail} about ${user.name}`)
  },
})
```

---

## Writing your own adapter

Implement four methods:

```typescript
interface DeadCheckAdapter {
  getUser(userId: string):        Promise<DCUser | null>
  updateCheckin(userId: string):  Promise<DCUser>
  getSilentUsers(since: Date):    Promise<DCUser[]>
  markNotified(userId: string):   Promise<void>
}
```

Example — Drizzle adapter:

```typescript
import { eq, lt, isNotNull } from 'drizzle-orm'
import type { DCUser, DeadCheckAdapter } from 'dead-check'
import { db } from './db'
import { users } from './schema'

export class DrizzleAdapter implements DeadCheckAdapter {
  async getUser(userId: string): Promise<DCUser | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    return user ?? null
  }

  async updateCheckin(userId: string): Promise<DCUser> {
    const existing = await this.getUser(userId)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const streak = existing?.lastCheckin && existing.lastCheckin >= yesterday
      ? (existing.streak ?? 0) + 1
      : 1

    const [updated] = await db.update(users)
      .set({ lastCheckin: now, streak })
      .where(eq(users.id, userId))
      .returning()
    return updated
  }

  async getSilentUsers(since: Date): Promise<DCUser[]> {
    return db.select().from(users)
      .where(isNotNull(users.emergencyEmail))
      .where(lt(users.lastCheckin, since))
  }

  async markNotified(userId: string): Promise<void> {
    await db.update(users)
      .set({ notifiedAt: new Date() })
      .where(eq(users.id, userId))
  }
}
```

---

## FAQ

**Q: Does dead-check store email content?**

No. dead-check never stores emails. It calls your `notifyFn` with a `SilentUser` object containing `emergencyEmail`, `name`, and `daysSinceLast`. What you do with that is up to you. The built-in templates are just helper functions that return strings.

**Q: What if `notifyFn` throws?**

The error is caught and logged to `console.error`. The user is **not** marked as notified, so they'll be retried on the next `runCheck()`. The error count is returned in `result.errors`. Other users still get processed — one failure doesn't stop the loop.

**Q: Can I notify multiple people?**

Yes. `notifyFn` receives the full `SilentUser` object. Send to as many recipients as you want inside that function:

```typescript
notifyFn: async (user) => {
  const contacts = await getContactsForUser(user.id)
  await Promise.all(contacts.map(c => sendEmail(c.email, user)))
}
```

**Q: How do I test this locally without waiting 2 days?**

Use `silenceDays: 0` and the `InMemoryAdapter` with `seedUser`:

```typescript
const db = new InMemoryAdapter()
db.seedUser({
  id: 'test-user',
  emergencyEmail: 'friend@example.com',
  name: 'Test User',
  lastCheckin: new Date(Date.now() - 86400000), // 1 day ago
  streak: 5,
})

const dc = new DeadCheck({
  silenceDays: 0,
  db,
  notifyFn: async (user) => console.log('Would notify:', user.emergencyEmail),
})

await dc.runCheck() // triggers immediately
```

Or run the [interactive demo](./demo) — it has a "Simulate 3 days of silence" button.

**Q: Can I use hours instead of days?**

Not yet. `silenceDays` is the only precision available. Set `silenceDays: 1` and run `runCheck()` more frequently (e.g. every hour) for faster detection — a user who missed 24 hours will be caught on the next run.
