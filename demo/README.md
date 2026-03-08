# dead-check demo

Interactive playground showing dead-check working end-to-end.

## Run it

```bash
cd demo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What it does

1. **Check In** — Enter a user ID and emergency email, click "Check In" to record a check-in
2. **Simulate Silence** — Sets the user's last check-in to 3 days ago
3. **Run Check** — Scans all users and triggers notifications for anyone silent >= 2 days
4. **User Status** — Live status card that auto-refreshes every 3 seconds

Notifications aren't sent as real emails — they're logged to the Notification Log panel on the page, showing the full email template output (subject + body) that a real user's emergency contact would receive.

The API Log panel shows every API call made, so you can see exactly what's happening under the hood.

## Stack

- Next.js 14 (App Router)
- Tailwind CSS
- dead-check with InMemoryAdapter (no database needed)
