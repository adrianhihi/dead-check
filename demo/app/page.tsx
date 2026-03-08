'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface CheckinResult {
  userId: string
  streak: number
  isNew: boolean
  lastSeen: string
}

interface UserStatus {
  userId: string
  streak: number
  lastCheckin: string | null
  isSilent: boolean
  daysSinceLast: number
}

interface NotificationEntry {
  timestamp: string
  userId: string
  emergencyEmail: string
  subject: string
  body: string
  html: string
}

interface LogEntry {
  id: number
  method: string
  path: string
  body?: string
  response: string
  timestamp: string
}

export default function Home() {
  const [userId, setUserId] = useState('alice')
  const [emergencyEmail, setEmergencyEmail] = useState('bob@example.com')
  const [status, setStatus] = useState<UserStatus | null>(null)
  const [notifications, setNotifications] = useState<NotificationEntry[]>([])
  const [apiLog, setApiLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const logIdRef = useRef(0)

  const addLog = useCallback((method: string, path: string, response: unknown, body?: unknown) => {
    logIdRef.current++
    setApiLog(prev => [{
      id: logIdRef.current,
      method,
      path,
      body: body ? JSON.stringify(body) : undefined,
      response: JSON.stringify(response, null, 2),
      timestamp: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 20))
  }, [])

  const fetchStatus = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`/api/status?userId=${encodeURIComponent(userId)}`)
      const data = await res.json()
      if (data.status) setStatus(data.status)
      if (data.notifications) setNotifications(data.notifications)
    } catch {}
  }, [userId])

  // Auto-refresh every 3 seconds
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleCheckin = async () => {
    setLoading('checkin')
    const body = { userId, emergencyEmail, name: userId }
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    addLog('POST', '/api/checkin', data, body)
    await fetchStatus()
    setLoading(null)
  }

  const handleSimulateSilence = async () => {
    setLoading('silence')
    const body = { userId }
    const res = await fetch('/api/simulate-silence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    addLog('POST', '/api/simulate-silence', data, body)
    await fetchStatus()
    setLoading(null)
  }

  const handleRunCheck = async () => {
    setLoading('runcheck')
    const res = await fetch('/api/run-check', { method: 'POST' })
    const data = await res.json()
    if (data.notifications) setNotifications(data.notifications)
    const { notifications: _, ...result } = data
    addLog('POST', '/api/run-check', result)
    await fetchStatus()
    setLoading(null)
  }

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-gray-500">$</span> dead-check <span className="text-gray-500 text-lg font-normal">demo</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          A minimal dead man&apos;s switch — interactive playground
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column — Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Check In */}
          <Card title="1. Check In" subtitle="dc.checkin(userId)">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">User ID</label>
                  <input
                    type="text"
                    value={userId}
                    onChange={e => setUserId(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-600"
                    placeholder="alice"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Emergency Email</label>
                  <input
                    type="email"
                    value={emergencyEmail}
                    onChange={e => setEmergencyEmail(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-600"
                    placeholder="bob@example.com"
                  />
                </div>
              </div>
              <button
                onClick={handleCheckin}
                disabled={loading === 'checkin' || !userId}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
              >
                {loading === 'checkin' ? 'Checking in...' : 'Check In'}
              </button>
            </div>
          </Card>

          {/* Simulate Silence */}
          <Card title="2. Simulate Silence" subtitle="Sets lastCheckin to 3 days ago">
            <button
              onClick={handleSimulateSilence}
              disabled={loading === 'silence' || !userId}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              {loading === 'silence' ? 'Simulating...' : 'Simulate 3 Days of Silence'}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Moves the user&apos;s last check-in back 3 days so they appear silent.
            </p>
          </Card>

          {/* Run Check */}
          <Card title="3. Run Check" subtitle="dc.runCheck()">
            <button
              onClick={handleRunCheck}
              disabled={loading === 'runcheck'}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              {loading === 'runcheck' ? 'Running...' : 'Run Check'}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Scans all users and triggers notifications for anyone silent {'>'}= 2 days.
            </p>
          </Card>

          {/* Notification Log */}
          <Card title="Notification Log" subtitle="Emails that would be sent">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-600">
                No notifications yet. Check in, simulate silence, then run check.
              </p>
            ) : (
              <div className="space-y-4">
                {notifications.map((n, i) => (
                  <div key={i} className="border border-gray-800 rounded-lg overflow-hidden">
                    <div className="bg-[#1a1a1a] px-4 py-2 flex items-center justify-between">
                      <div className="text-xs font-mono">
                        <span className="text-red-400">TO:</span>{' '}
                        <span className="text-gray-300">{n.emergencyEmail}</span>
                      </div>
                      <span className="text-xs text-gray-600">
                        {new Date(n.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="px-4 py-3">
                      <div className="text-sm font-medium text-amber-400 mb-2">
                        {n.subject}
                      </div>
                      <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
                        {n.body}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column — Status + API Log */}
        <div className="space-y-6">
          {/* User Status */}
          <Card title="4. User Status" subtitle="dc.getUser(userId) — refreshes every 3s">
            {status ? (
              <div className="space-y-3">
                <StatusRow label="userId" value={status.userId} />
                <StatusRow label="streak" value={String(status.streak)} highlight />
                <StatusRow
                  label="lastCheckin"
                  value={status.lastCheckin
                    ? new Date(status.lastCheckin).toLocaleString()
                    : 'never'}
                />
                <StatusRow
                  label="isSilent"
                  value={String(status.isSilent)}
                  color={status.isSilent ? 'text-red-400' : 'text-emerald-400'}
                />
                <StatusRow
                  label="daysSinceLast"
                  value={status.daysSinceLast === -1 ? 'N/A' : String(status.daysSinceLast)}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                No user data yet. Enter a user ID and check in.
              </p>
            )}
          </Card>

          {/* API Log */}
          <Card title="API Log" subtitle="Recent API calls">
            {apiLog.length === 0 ? (
              <p className="text-sm text-gray-600">
                API calls will appear here.
              </p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {apiLog.map(entry => (
                  <div key={entry.id} className="border border-gray-800 rounded p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${
                        entry.method === 'POST' ? 'text-amber-400' : 'text-blue-400'
                      }`}>
                        {entry.method}
                      </span>
                      <span className="text-xs font-mono text-gray-400">{entry.path}</span>
                      <span className="text-xs text-gray-600 ml-auto">{entry.timestamp}</span>
                    </div>
                    {entry.body && (
                      <pre className="text-xs text-gray-500 font-mono mb-1">
                        {'> '}{entry.body}
                      </pre>
                    )}
                    <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">
                      {'< '}{entry.response}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Card({ title, subtitle, children }: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-[#111] border border-gray-800 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
        <p className="text-xs text-gray-500 font-mono mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function StatusRow({ label, value, highlight, color }: {
  label: string
  value: string
  highlight?: boolean
  color?: string
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-800/50 last:border-0">
      <span className="text-xs text-gray-500 font-mono">{label}</span>
      <span className={`text-sm font-mono ${color || (highlight ? 'text-amber-400 font-bold' : 'text-gray-300')}`}>
        {value}
      </span>
    </div>
  )
}
