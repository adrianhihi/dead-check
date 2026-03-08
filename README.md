[![npm version](https://badge.fury.io/js/dead-check.svg)](https://www.npmjs.com/package/dead-check)
[![CI](https://github.com/stillemployed/dead-check/actions/workflows/ci.yml/badge.svg)](https://github.com/stillemployed/dead-check/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built for Still Employed](https://img.shields.io/badge/built%20for-stillemployed.app-F59B2B)](https://stillemployed.app)

# dead-check

**A minimal dead man's switch for your app.**  
If a user stops checking in, someone they trust gets notified.

Built for [Still Employed](https://stillemployed.app) — the app where people check in daily to confirm they haven't been replaced by AI. If they go quiet for 2 days, their emergency contact gets an email.

```
User checks in → streak continues → everyone's fine
User goes quiet → 2 days pass → their person gets an email
```

---

![dead-check demo](./demo/dead-check-demo.gif)

---

## Why this exists

The original "Are You OK?" apps (like the Japanese 死んでいませんか) proved one thing: sometimes people just need a quiet, low-stakes way to say *"I'm still here."*

`dead-check` is that primitive, extracted into a reusable module. Use it for:

- **Employment anxiety** — daily check-in to confirm you're still employed (our use case)
- **Mental health** — gentle "are you okay?" nudge to someone's support person
- **Elderly care** — family gets notified if grandma doesn't check in
- **Habit tracking** — accountability partner gets pinged if you skip
- **Solo travel** — emergency contact notified if you go off-grid too long
- **Any app** where "going quiet" means something important

---

## How it works

```
┌─────────────┐     POST /checkin      ┌──────────────────┐
│    User     │ ──────────────────────▶ │  dead-check API  │
│  (daily)    │                         │                  │
└─────────────┘                         │  - updates       │
                                        │    lastCheckin   │
                                        │  - increments    │
┌─────────────┐   cron: check daily     │    streak        │
│  Scheduler  │ ──────────────────────▶ │                  │
└─────────────┘                         │  - finds users   │
                                        │    silent for    │
                                        │    N days        │
┌─────────────┐   sends email           │                  │
│  Emergency  │ ◀────────────────────── │  - notifies      │
│  Contact    │                         │    contact       │
└─────────────┘                         └──────────────────┘
```

---

## Quick start

```bash
npm install dead-check
```

```typescript
import { DeadCheck } from 'dead-check'

const dc = new DeadCheck({
  silenceDays: 2,                    // how many days of silence triggers notification
  notifyFn: async (user) => {        // bring your own email sender
    await sendEmail({
      to: user.emergencyEmail,
      subject: `Check on ${user.name}`,
      body: emailTemplate(user),
    })
  },
})

// In your check-in endpoint:
await dc.checkin(userId)

// In your daily cron job:
await dc.runCheck()                  // finds silent users, calls notifyFn for each
```

That's it. Two functions.

---

## Full API

### `new DeadCheck(config)`

```typescript
interface DeadCheckConfig {
  silenceDays:  number                           // required. days before notifying
  notifyFn:     (user: SilentUser) => Promise<void>  // required. called once per silent user
  db?:          DeadCheckAdapter                 // optional. bring your own DB adapter
  onCheckin?:   (userId: string) => void         // optional. hook after check-in
  onNotify?:    (user: SilentUser) => void        // optional. hook after notification sent
}
```

### `dc.checkin(userId: string): Promise<CheckinResult>`

```typescript
interface CheckinResult {
  userId:    string
  streak:    number     // consecutive days checked in
  isNew:     boolean    // first ever check-in
  lastSeen:  Date
}
```

### `dc.runCheck(): Promise<CheckResult>`

Run this daily via cron. Finds all users whose `lastCheckin` is older than `silenceDays`.

```typescript
interface CheckResult {
  checked:   number   // total users scanned
  silent:    number   // users who triggered notification
  notified:  number   // notifications successfully sent
  errors:    number   // notifications that failed
}
```

### `dc.getUser(userId: string): Promise<UserStatus>`

```typescript
interface UserStatus {
  userId:        string
  streak:        number
  lastCheckin:   Date | null
  isSilent:      boolean
  daysSinceLast: number
}
```

---

## Database adapters

`dead-check` ships with a Prisma adapter. Plug in your own schema:

```typescript
// prisma/schema.prisma — add these fields to your User model:
model User {
  id                 String    @id @default(cuid())
  // ... your existing fields ...

  // dead-check fields:
  emergencyEmail     String?
  lastCheckin        DateTime?
  streak             Int       @default(0)
  notifiedAt         DateTime? // when we last sent the notification
}
```

```typescript
import { PrismaAdapter } from 'dead-check/adapters/prisma'
import { prisma } from '@/lib/prisma'

const dc = new DeadCheck({
  silenceDays: 2,
  db: new PrismaAdapter(prisma),
  notifyFn: async (user) => { /* ... */ },
})
```

### Custom adapter

Implement the `DeadCheckAdapter` interface to use any database:

```typescript
interface DeadCheckAdapter {
  getUser(userId: string):             Promise<DCUser | null>
  updateCheckin(userId: string):       Promise<DCUser>
  getSilentUsers(since: Date):         Promise<DCUser[]>
  markNotified(userId: string):        Promise<void>
}
```

---

## Email templates

`dead-check` ships with two templates out of the box. Use them, modify them, or write your own.

### Default template (warm)

```
Subject: A quick check — [Name] hasn't checked in

Hey,

You're listed as [Name]'s emergency contact on Still Employed.

They haven't checked in for 2 days. This might mean nothing —
maybe they're on a trip, maybe they just forgot.

But they trusted you enough to put your name down. So we thought
you should know.

— dead-check
```

### Minimal template

```
Subject: [Name] · 2 days since last check-in

[Name] hasn't checked in since [date].
You're their emergency contact. That's all we know.
```

### Usage

```typescript
import { templates } from 'dead-check/templates'

const dc = new DeadCheck({
  silenceDays: 2,
  notifyFn: async (user) => {
    await resend.emails.send({
      to:      user.emergencyEmail,
      from:    'noreply@yourapp.com',
      subject: templates.warm.subject(user),
      html:    templates.warm.html(user),
    })
  },
})
```

---

## Next.js example

```typescript
// app/api/checkin/route.ts
import { dc } from '@/lib/dead-check'

export async function POST(req: Request) {
  const session = await getServerSession()
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const result = await dc.checkin(session.user.id)
  return Response.json(result)
}
```

```typescript
// app/api/cron/dead-check/route.ts
import { dc } from '@/lib/dead-check'

export async function GET(req: Request) {
  // Protect with a secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await dc.runCheck()
  return Response.json(result)
}
```

```typescript
// lib/dead-check.ts — singleton
import { DeadCheck, PrismaAdapter } from 'dead-check'
import { prisma } from './prisma'
import { resend } from './resend'
import { templates } from 'dead-check/templates'

export const dc = new DeadCheck({
  silenceDays: 2,
  db: new PrismaAdapter(prisma),
  notifyFn: async (user) => {
    await resend.emails.send({
      to:      user.emergencyEmail!,
      from:    'noreply@yourapp.com',
      subject: templates.warm.subject(user),
      html:    templates.warm.html(user),
    })
  },
})
```

See [`examples/nextjs`](./examples/nextjs) for a complete working example.

---

## Vercel Cron setup

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
```

---

## Configuration reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `silenceDays` | `number` | — | **Required.** Days of silence before notifying |
| `notifyFn` | `function` | — | **Required.** Called for each silent user |
| `db` | `adapter` | in-memory | Database adapter |
| `onCheckin` | `function` | — | Hook after successful check-in |
| `onNotify` | `function` | — | Hook after notification sent |
| `notifyOnce` | `boolean` | `true` | Don't re-notify if already notified recently |
| `renotifyAfterDays` | `number` | `7` | Days before re-notifying if still silent |
| `timezone` | `string` | `UTC` | Timezone for silence calculation |

---

## Philosophy

`dead-check` does one thing: **notice when someone goes quiet, and tell someone who cares.**

It doesn't track location. It doesn't read messages. It doesn't make assumptions about why someone went quiet. It just notices, and nudges.

The logic is under 200 lines. The rest is your app.

---

## Demo

Try dead-check interactively with the built-in [demo app](./demo):

```bash
cd demo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — check in, simulate silence, run the check, and see the full notification email output.

---

## Contributing

PRs welcome, especially for:
- New database adapters (Drizzle, Mongoose, Supabase)
- Email provider examples (SendGrid, Postmark, AWS SES)
- New templates
- `silenceHours` option for sub-day precision

---

## License

MIT

---

*Built for [Still Employed](https://stillemployed.app) — check in daily, confirm you're still here.*  
*If you stop, someone you trust finds out.*
