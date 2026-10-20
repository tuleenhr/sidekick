'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded ${className}`} />
}

function NightDebriefTrigger() {
  const hour = new Date().getHours()
  if (hour < 19 && hour >= 4) return null

  async function startDebrief() {
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'End of day.',
        system_inject: 'End of day mode. Ask one question: "How did today go?" Then continue naturally. One question at a time. Cover what happened, what didn\'t, what moves to tomorrow. End with the one most important thing for tomorrow. Tone: calm, quiet.',
      }),
    })
    window.location.href = '/chat'
  }

  return (
    <button onClick={startDebrief} className="text-lg hover:scale-110 transition-transform" title="Night debrief">
      🌙
    </button>
  )
}

function TripBanner({ trip, onGenerate }: { trip: any; onGenerate: () => void }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function generate() {
    setLoading(true)
    await fetch(`/api/trips/${trip.id}/generate-pack`, { method: 'POST' })
    setLoading(false)
    setDone(true)
    onGenerate()
  }

  if (done) return null

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-900/5 p-3 flex items-center justify-between gap-3">
      <p className="text-sm">✈️ <span className="font-medium">{trip.origin} → {trip.destination}</span>, {trip.departure_date} — no travel pack yet</p>
      <button
        onClick={generate}
        disabled={loading}
        className="shrink-0 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Generating...' : 'Generate pack'}
      </button>
    </div>
  )
}

export default function TodayPage() {
  const [brief, setBrief] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [unpackedTrips, setUnpackedTrips] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/brief')
      .then((r) => r.json())
      .then((data) => { if (data.error) setError(data.error); else setBrief(data) })
      .catch(() => setError('Could not load brief'))
      .finally(() => setLoading(false))

    // Check for upcoming trips with no pack generated
    fetch('/api/trips')
      .then((r) => r.json())
      .then((trips: any[]) => {
        const today = new Date().toISOString().split('T')[0]
        const upcoming = (trips || []).filter((t: any) =>
          t.status === 'upcoming' &&
          t.departure_date >= today &&
          !t.overview
        )
        setUnpackedTrips(upcoming.slice(0, 2))
      })
      .catch(() => {})
  }, [])

  async function regenerate() {
    setRegenerating(true)
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/brief', { method: 'DELETE' })
      const data = await r.json()
      if (data.error) setError(data.error); else setBrief(data)
    } catch {
      setError('Failed to regenerate')
    } finally {
      setRegenerating(false)
      setLoading(false)
    }
  }

  const today = format(new Date(), 'EEEE, d MMMM')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-widest">{today}</p>
          <h1 className="text-lg font-semibold mt-0.5">Today</h1>
        </div>
        <div className="flex items-center gap-3">
          <NightDebriefTrigger />
          <button
            onClick={regenerate}
            disabled={regenerating || loading}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors disabled:opacity-40"
          >
            {regenerating ? 'Rebuilding...' : '↺ Rebuild'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/10 rounded-lg p-3">{error}</div>
      )}

      {/* Trip detection banners */}
      {unpackedTrips.map((trip) => (
        <TripBanner key={trip.id} trip={trip} onGenerate={() => setUnpackedTrips((prev) => prev.filter((t) => t.id !== trip.id))} />
      ))}

      {/* Brief paragraph */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      ) : brief?.brief_paragraph ? (
        <p className="text-base leading-relaxed">{brief.brief_paragraph}</p>
      ) : null}

      {/* Priority cards */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : brief?.priorities?.length > 0 ? (
        <div className="space-y-3">
          {(brief.priorities as any[]).map((p: any, i: number) => (
            <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{p.task}</p>
                {p.estimated_minutes && (
                  <span className="text-xs text-zinc-400 shrink-0">{p.estimated_minutes}min</span>
                )}
              </div>
              {p.consequence && <p className="text-xs text-zinc-400">{p.consequence}</p>}
              {p.first_step && <p className="text-xs text-zinc-500 dark:text-zinc-400">→ {p.first_step}</p>}
            </div>
          ))}
        </div>
      ) : !loading && brief ? (
        <p className="text-sm text-zinc-400">Nothing critical today.</p>
      ) : null}

      {/* Day plan */}
      {brief?.day_plan?.length > 0 && (
        <div className="space-y-2">
          {(brief.day_plan as any[]).map((block: any, i: number) => (
            <div key={i} className="flex gap-4 text-sm">
              <span className="text-zinc-400 shrink-0 w-12">{block.time}</span>
              <span className="text-zinc-700 dark:text-zinc-300">{block.block}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick link to chat */}
      {!loading && (
        <Link
          href="/chat"
          className="block text-center text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-2"
        >
          💬 Open chat →
        </Link>
      )}
    </div>
  )
}
