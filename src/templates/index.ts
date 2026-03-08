import type { SilentUser } from '../index'

// ── Template interface ───────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: (user: SilentUser) => string
  text:    (user: SilentUser) => string
  html:    (user: SilentUser) => string
}

// ── Warm template (default) ─────────────────────────────────────────────────
// Tone: a gentle nudge from a friend. Not alarming. Just noticing.

const warm: EmailTemplate = {
  subject: (user) =>
    `A quick check — ${user.name ?? 'Someone'} hasn't checked in`,

  text: (user) => `
Hey,

You're listed as ${user.name ?? 'someone'}'s emergency contact.

They haven't checked in for ${user.daysSinceLast} day${user.daysSinceLast !== 1 ? 's' : ''}.
This might mean nothing — maybe they're travelling, maybe they just forgot.

But they trusted you enough to put your name down.
So we thought you should know.

— dead-check
`.trim(),

  html: (user) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9f5f0; margin: 0; padding: 32px 16px; }
    .card { background: #fff; border-radius: 16px; max-width: 480px;
            margin: 0 auto; padding: 32px; box-shadow: 0 2px 16px rgba(0,0,0,.06); }
    .tag  { display: inline-block; background: #FFF3E4; border: 1.5px solid #EDD9C0;
            border-radius: 100px; padding: 4px 12px; font-size: 12px; color: #6B4C2A;
            margin-bottom: 20px; }
    h1    { font-size: 22px; color: #2D1B00; margin: 0 0 12px; font-weight: 700; }
    p     { font-size: 15px; color: #6B4C2A; line-height: 1.7; margin: 0 0 14px; }
    .name { color: #2D1B00; font-weight: 600; }
    .days { color: #F59B2B; font-weight: 600; }
    .footer { margin-top: 28px; padding-top: 20px; border-top: 1px solid #EDD9C0;
              font-size: 12px; color: #B89070; }
    .footer a { color: #F59B2B; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="tag">📬 from dead-check</div>
    <h1>A quick check-in</h1>
    <p>
      You're listed as <span class="name">${user.name ?? 'someone'}</span>'s
      emergency contact.
    </p>
    <p>
      They haven't checked in for
      <span class="days">${user.daysSinceLast} day${user.daysSinceLast !== 1 ? 's' : ''}</span>.
      This might mean nothing — maybe they're travelling, maybe they just forgot.
    </p>
    <p>
      But they trusted you enough to put your name down.<br>
      So we thought you should know.
    </p>
    <div class="footer">
      Sent by <a href="https://github.com/stillemployed/dead-check">dead-check</a> ·
      Built for <a href="https://stillemployed.app">Still Employed</a> ·
      <a href="#">Unsubscribe</a>
    </div>
  </div>
</body>
</html>
`.trim(),
}

// ── Minimal template ─────────────────────────────────────────────────────────
// Tone: no fluff. Just the facts.

const minimal: EmailTemplate = {
  subject: (user) =>
    `${user.name ?? 'User'} · ${user.daysSinceLast}d since last check-in`,

  text: (user) => `
${user.name ?? 'A user'} hasn't checked in since ${formatDate(user.lastCheckin)}.
You're their emergency contact.
That's all we know.

— dead-check
`.trim(),

  html: (user) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body  { font-family: 'DM Mono', monospace, monospace;
            background: #0D0D0D; margin: 0; padding: 32px 16px; }
    .card { background: #141414; border: 1px solid rgba(255,255,255,.08);
            border-radius: 12px; max-width: 480px; margin: 0 auto; padding: 28px; }
    .tag  { font-size: 10px; color: rgba(255,255,255,.3); letter-spacing: 2px;
            text-transform: uppercase; margin-bottom: 20px; }
    p     { font-size: 14px; color: rgba(255,255,255,.6); line-height: 1.8;
            margin: 0 0 10px; }
    .name { color: #fff; }
    .days { color: #FF4500; }
    .footer { margin-top: 24px; font-size: 11px; color: rgba(255,255,255,.2); }
    .footer a { color: rgba(255,69,0,.6); text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="tag">DEAD-CHECK · ALERT</div>
    <p><span class="name">${user.name ?? 'A user'}</span> hasn't checked in.</p>
    <p>Last seen: ${formatDate(user.lastCheckin)} · <span class="days">${user.daysSinceLast}d ago</span></p>
    <p>You're their emergency contact. That's all we know.</p>
    <div class="footer">
      <a href="https://github.com/stillemployed/dead-check">dead-check</a> ·
      <a href="https://stillemployed.app">Still Employed</a>
    </div>
  </div>
</body>
</html>
`.trim(),
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const templates = { warm, minimal }
export default templates

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | null): string {
  if (!date) return 'unknown'
  return date.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}
