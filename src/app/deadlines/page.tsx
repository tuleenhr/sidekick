'use client'

import { useEffect, useState } from 'react'
import { format, formatDistanceToNow, differenceInDays, differenceInWeeks } from 'date-fns'
import { Badge } from '@/components/ui/Badge'
import { urgencyToVariant, daysUntil } from '@/lib/utils'
import type { Deadline } from '@/types'
import { showToast } from '@/components/ui/Toast'
import { fireConfetti } from '@/lib/confetti'

const CATEGORY_LABELS: Record<string, string> = {
  uni: 'Uni', career: 'Career', admin: 'Admin', travel: 'Travel', personal: 'Personal',
}

// ─── Trip full pack sheet ───────────────────────────────────────────────────
function TripPackSheet({ trip, onClose, onUpdate }: { trip: any; onClose: () => void; onUpdate: (t: any) => void }) {
  const [tab, setTab] = useState<'overview' | 'before' | 'packing' | 'money' | 'itinerary'>('overview')
  const [generating, setGenerating] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [forgotten, setForgotten] = useState('')

  const hasPackData = !!trip.packing_list

  async function regenerate() {
    setGenerating(true)
    await fetch(`/api/trips/${trip.id}/generate-pack`, { method: 'POST' })
    const r = await fetch('/api/trips')
    const trips = await r.json()
    const updated = trips.find((t: any) => t.id === trip.id)
    if (updated) onUpdate(updated)
    setGenerating(false)
  }

  async function saveFeedback() {
    await fetch('/api/trips', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: trip.id, status: 'completed' }),
    })
    // Save to packing logs
    await fetch('/api/home-context', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setFeedbackOpen(false)
    onClose()
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'before', label: 'Before you leave' },
    { key: 'packing', label: 'Packing' },
    { key: 'money', label: 'Money & logistics' },
    { key: 'itinerary', label: 'Itinerary' },
  ]

  const daysAway = differenceInDays(new Date(trip.departure_date), new Date())

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold">✈️ {trip.origin} → {trip.destination}</h2>
          <p className="text-xs text-zinc-400">{format(new Date(trip.departure_date), 'EEE d MMM')} · {daysAway > 0 ? `${daysAway} days away` : 'Today'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={regenerate} disabled={generating} className="text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-40">
            {generating ? 'Generating...' : '↺ Regenerate'}
          </button>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">×</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 px-4 gap-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {!hasPackData && !generating && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-3">
            <p className="text-sm text-zinc-500">Travel pack not generated yet.</p>
            <button onClick={regenerate} className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm px-4 py-2 rounded-lg hover:opacity-80">
              Generate pack
            </button>
          </div>
        )}
        {generating && (
          <div className="space-y-3 pt-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
          </div>
        )}

        {hasPackData && !generating && (
          <>
            {tab === 'overview' && (
              <div className="space-y-4">
                {trip.leave_home_by && (
                  <div className="rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Leave home by</p>
                    <p className="text-2xl font-bold mt-1">{trip.leave_home_by}</p>
                  </div>
                )}
                {trip.flight_number && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Flight</p>
                    <p className="text-sm font-medium">{trip.airline} {trip.flight_number}</p>
                    {trip.departure_time && <p className="text-xs text-zinc-500">Departs {format(new Date(trip.departure_time), 'HH:mm, EEE d MMM')}</p>}
                    {trip.arrival_time && <p className="text-xs text-zinc-500">Arrives {format(new Date(trip.arrival_time), 'HH:mm, EEE d MMM')}</p>}
                    {trip.terminal && <p className="text-xs text-zinc-500">Terminal {trip.terminal}</p>}
                    {trip.booking_reference && <p className="text-xs text-zinc-400">Ref: {trip.booking_reference}</p>}
                  </div>
                )}
                {trip.hotel_name && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Hotel</p>
                    <p className="text-sm font-medium">{trip.hotel_name}</p>
                    {trip.checkin_date && <p className="text-xs text-zinc-500">Check-in {format(new Date(trip.checkin_date), 'EEE d MMM')} · Check-out {trip.checkout_date ? format(new Date(trip.checkout_date), 'EEE d MMM') : '—'}</p>}
                    {trip.hotel_confirmation && <p className="text-xs text-zinc-400">Conf: {trip.hotel_confirmation}</p>}
                  </div>
                )}
                {trip.weather_snapshot && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Weather at destination</p>
                    <p className="text-sm">{trip.weather_snapshot.temperature}°C · {trip.weather_snapshot.condition}</p>
                    {trip.weather_snapshot.relevant_note && <p className="text-xs text-zinc-400 mt-0.5">{trip.weather_snapshot.relevant_note}</p>}
                  </div>
                )}
              </div>
            )}

            {tab === 'before' && trip.pre_departure_checklist && (
              <div className="space-y-5">
                {Object.entries(trip.pre_departure_checklist).map(([section, items]: [string, any]) => {
                  if (!items?.length) return null
                  const label = section === 'always' ? '✓ Always' : section === 'trip_specific' ? '🗺 This trip' : section === 'home_reset' ? '🏠 Home reset' : section === 'fridge_use_up' ? '🧊 Use up before you leave' : '📅 Deadlines while away'
                  return (
                    <div key={section} className="space-y-2">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</p>
                      {items.map((item: string, i: number) => (
                        <label key={i} className="flex items-start gap-3 cursor-pointer">
                          <input type="checkbox" checked={!!checkedItems[`${section}-${i}`]} onChange={(e) => setCheckedItems((p) => ({ ...p, [`${section}-${i}`]: e.target.checked }))} className="mt-0.5 shrink-0" />
                          <span className={`text-sm ${checkedItems[`${section}-${i}`] ? 'line-through text-zinc-400' : ''}`}>{item}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'packing' && trip.packing_list && (
              <div className="space-y-5">
                {Object.entries(trip.packing_list).map(([section, items]: [string, any]) => {
                  if (!items?.length) return null
                  const label = section === 'documents' ? '📄 Documents' : section === 'tech' ? '💻 Tech' : section === 'clothes' ? '👗 Clothes' : section === 'toiletries' ? '🧴 Toiletries' : section === 'comfort' ? '🛋 Comfort' : '📍 Destination-specific'
                  return (
                    <div key={section} className="space-y-2">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</p>
                      {items.map((item: string, i: number) => (
                        <label key={i} className="flex items-start gap-3 cursor-pointer">
                          <input type="checkbox" checked={!!checkedItems[`pack-${section}-${i}`]} onChange={(e) => setCheckedItems((p) => ({ ...p, [`pack-${section}-${i}`]: e.target.checked }))} className="mt-0.5 shrink-0" />
                          <span className={`text-sm ${checkedItems[`pack-${section}-${i}`] ? 'line-through text-zinc-400' : ''}`}>{item}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
                <div className="pt-4">
                  <button onClick={() => setFeedbackOpen(true)} className="text-xs text-zinc-400 hover:text-zinc-600">
                    Trip done — what did you forget?
                  </button>
                </div>
              </div>
            )}

            {tab === 'money' && trip.money_logistics && (
              <div className="space-y-3">
                {[
                  ['Currency', trip.money_logistics.currency_note],
                  ['SIM / eSIM', trip.money_logistics.sim_recommendation],
                  ['Plug type', trip.money_logistics.plug_type],
                  ['Getting around', trip.money_logistics.transport_from_airport],
                  ['Cards & payments', trip.money_logistics.payment_note],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-sm">{value as string}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === 'itinerary' && (
              <div>
                {trip.itinerary ? (
                  <div className="space-y-3">
                    {(trip.itinerary as any[]).map((day: any, i: number) => (
                      <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Day {day.day} — {day.date}</p>
                        <p className="text-sm">{day.plan}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">Regular route — no itinerary generated.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Feedback modal */}
      {feedbackOpen && (
        <div className="fixed inset-0 z-60 flex items-end justify-center bg-black/40">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold">Anything you forgot or wish you'd brought?</h3>
            <textarea
              autoFocus
              className="w-full text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 resize-none focus:outline-none min-h-[80px]"
              placeholder="e.g. forgot my charger, wished I'd brought a jacket..."
              value={forgotten}
              onChange={(e) => setForgotten(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={saveFeedback} className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 py-2.5 rounded-xl text-sm font-medium hover:opacity-80">
                Save & close
              </button>
              <button onClick={() => setFeedbackOpen(false)} className="px-4 text-sm text-zinc-500">Skip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main deadlines page ────────────────────────────────────────────────────
export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [waitingOn, setWaitingOn] = useState<any[]>([])
  const [trips, setTrips] = useState<any[]>([])
  const [moveOutTasks, setMoveOutTasks] = useState<any[]>([])
  const [homeCtx, setHomeCtx] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addingTrip, setAddingTrip] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState<any>(null)
  const [moveOutExpanded, setMoveOutExpanded] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '', category: 'admin', consequence: '', first_step: '' })
  const [tripForm, setTripForm] = useState({ origin: '', destination: '', departure_date: '', return_date: '', trip_purpose: 'family' })

  useEffect(() => {
    Promise.all([
      fetch('/api/deadlines').then((r) => r.json()),
      fetch('/api/waiting-on').then((r) => r.json()),
      fetch('/api/trips').then((r) => r.json()),
      fetch('/api/move-out').then((r) => r.json()),
      fetch('/api/home-context').then((r) => r.json()),
    ]).then(([dl, wo, tr, mo, hc]) => {
      setDeadlines(dl)
      setWaitingOn(wo || [])
      setTrips(tr || [])
      setMoveOutTasks(mo || [])
      setHomeCtx(hc || {})
    }).finally(() => setLoading(false))
  }, [])

  async function addDeadline() {
    const res = await fetch('/api/deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, source: 'manual' }),
    })
    const d = await res.json()
    setDeadlines((prev) => [...prev, d].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()))
    setAdding(false)
    setForm({ title: '', due_date: '', category: 'admin', consequence: '', first_step: '' })
  }

  async function addTrip() {
    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tripForm),
    })
    const t = await res.json()
    setTrips((prev) => [...prev, t].sort((a, b) => new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime()))
    setAddingTrip(false)
    setTripForm({ origin: '', destination: '', departure_date: '', return_date: '', trip_purpose: 'family' })
    showToast({ label: 'Trip added', message: 'Generating your travel pack in the background...' })
  }

  async function markDone(id: string) {
    const r = await fetch('/api/deadlines', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'done' }),
    })
    setDeadlines((prev) => prev.filter((d) => d.id !== id))
    const data = await r.json()
    if (data.win) {
      await fireConfetti()
      showToast({ label: '[Win detected]', message: `Added to your evidence folder — ${data.win.title}` })
    }
  }

  async function resolveWaiting(id: string) {
    await fetch('/api/waiting-on', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'received' }),
    })
    setWaitingOn((prev) => prev.filter((w) => w.id !== id))
  }

  async function toggleMoveOutTask(id: string, done: boolean) {
    await fetch('/api/move-out', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: done ? 'done' : 'pending' }),
    })
    setMoveOutTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: done ? 'done' : 'pending' } : t))
  }

  const groups = {
    red: deadlines.filter((d) => d.urgency === 'red'),
    orange: deadlines.filter((d) => d.urgency === 'orange'),
    yellow: deadlines.filter((d) => d.urgency === 'yellow'),
    grey: deadlines.filter((d) => d.urgency === 'grey'),
  }
  const urgencyLabels = { red: 'Today / Critical', orange: 'This week', yellow: 'Soon', grey: 'Low priority' }

  const moveOutDate = homeCtx.move_out_date
  const moveOutMode = homeCtx.move_out_mode === 'true'
  const weeksUntilMoveOut = moveOutDate ? differenceInWeeks(new Date(moveOutDate), new Date()) : null

  const currentStage = (() => {
    if (!weeksUntilMoveOut) return 1
    if (weeksUntilMoveOut > 4) return 1
    if (weeksUntilMoveOut > 2) return 2
    if (weeksUntilMoveOut > 1) return 3
    return 4
  })()

  const currentStageTasks = moveOutTasks.filter((t) => t.stage === currentStage)
  const nextStageTasks = moveOutTasks.filter((t) => t.stage === currentStage + 1).slice(0, 3)

  return (
    <div className="space-y-6">
      {selectedTrip && (
        <TripPackSheet
          trip={selectedTrip}
          onClose={() => setSelectedTrip(null)}
          onUpdate={(t) => { setSelectedTrip(t); setTrips((prev) => prev.map((p) => p.id === t.id ? t : p)) }}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Deadlines</h1>
        <button
          onClick={() => setAdding(true)}
          className="text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
        >
          + Add
        </button>
      </div>

      {/* ─── Travel section ─── */}
      {!loading && trips.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">✈️ Upcoming trips</h2>
            <button onClick={() => setAddingTrip(true)} className="text-xs text-zinc-400 hover:text-zinc-600">+ New trip</button>
          </div>
          {trips.map((trip) => {
            const daysAway = differenceInDays(new Date(trip.departure_date), new Date())
            return (
              <div key={trip.id} className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-900/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{trip.origin} → {trip.destination}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {format(new Date(trip.departure_date), 'EEE d MMM')}
                      {trip.flight_number ? ` · ${trip.airline || ''} ${trip.flight_number}` : ''}
                      {trip.leave_home_by ? ` · Leave by ${trip.leave_home_by}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-400">{daysAway > 0 ? `${daysAway}d` : 'Today'}</span>
                    <button
                      onClick={() => setSelectedTrip(trip)}
                      className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg hover:opacity-80"
                    >
                      View pack →
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {addingTrip && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="From (e.g. London)" value={tripForm.origin} onChange={(e) => setTripForm((f) => ({ ...f, origin: e.target.value }))} className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none" />
                <input placeholder="To (e.g. Riyadh)" value={tripForm.destination} onChange={(e) => setTripForm((f) => ({ ...f, destination: e.target.value }))} className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-zinc-400">Departure</label><input type="date" value={tripForm.departure_date} onChange={(e) => setTripForm((f) => ({ ...f, departure_date: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none" /></div>
                <div><label className="text-xs text-zinc-400">Return (optional)</label><input type="date" value={tripForm.return_date} onChange={(e) => setTripForm((f) => ({ ...f, return_date: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none" /></div>
              </div>
              <select value={tripForm.trip_purpose} onChange={(e) => setTripForm((f) => ({ ...f, trip_purpose: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none">
                {['family', 'uni', 'holiday', 'work', 'transit'].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={addTrip} disabled={!tripForm.origin || !tripForm.destination || !tripForm.departure_date} className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm py-2 rounded-lg font-medium hover:opacity-80 disabled:opacity-40">Add trip</button>
                <button onClick={() => setAddingTrip(false)} className="px-4 text-sm text-zinc-500">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {!loading && trips.length === 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">No upcoming trips</span>
          <button onClick={() => setAddingTrip(true)} className="text-xs text-zinc-400 hover:text-zinc-600">✈️ Add trip</button>
        </div>
      )}

      {/* ─── Move-out section ─── */}
      {!loading && moveOutMode && moveOutTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              📦 Moving out · {weeksUntilMoveOut} weeks away
            </h2>
            <button onClick={() => setMoveOutExpanded(!moveOutExpanded)} className="text-xs text-zinc-400 hover:text-zinc-600">
              {moveOutExpanded ? 'Show less' : 'Full plan →'}
            </button>
          </div>
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-900/5 p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-500">Stage {currentStage} of 4</p>
            {(moveOutExpanded ? moveOutTasks : currentStageTasks).map((task) => (
              <label key={task.id} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={(e) => toggleMoveOutTask(task.id, e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <span className={`text-sm ${task.status === 'done' ? 'line-through text-zinc-400' : ''}`}>{task.title}</span>
                  {task.deadline && <p className="text-xs text-zinc-400">by {format(new Date(task.deadline), 'EEE d MMM')}</p>}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ─── Add deadline form ─── */}
      {adding && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <input type="datetime-local" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400">
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="First step" value={form.first_step} onChange={(e) => setForm((f) => ({ ...f, first_step: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <input placeholder="Consequence if missed (optional)" value={form.consequence} onChange={(e) => setForm((f) => ({ ...f, consequence: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <div className="flex gap-2">
            <button onClick={addDeadline} disabled={!form.title || !form.due_date} className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm py-2 rounded-lg font-medium hover:opacity-80 disabled:opacity-40 transition-opacity">Save</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700">Cancel</button>
          </div>
        </div>
      )}

      {/* ─── Waiting on ─── */}
      {!loading && waitingOn.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Waiting on</h2>
          {waitingOn.map((w) => (
            <div key={w.id} className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-900/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{w.title}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">From {w.waiting_for}{w.follow_up_date ? ` · follow up ${format(new Date(w.follow_up_date), 'EEE d MMM')}` : ''}</p>
                </div>
                <button onClick={() => resolveWaiting(w.id)} className="text-xs text-zinc-400 hover:text-green-600 transition-colors shrink-0">✓ Got it</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Deadlines ─── */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-20 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />)}</div>
      ) : deadlines.length === 0 ? (
        <p className="text-sm text-zinc-400 py-8 text-center">No deadlines tracked yet.</p>
      ) : (
        <div className="space-y-6">
          {(['red', 'orange', 'yellow', 'grey'] as const).map((urgency) => {
            const items = groups[urgency]
            if (!items.length) return null
            return (
              <div key={urgency}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">{urgencyLabels[urgency]}</h2>
                <div className="space-y-2">
                  {items.map((d) => {
                    const days = daysUntil(d.due_date)
                    return (
                      <div key={d.id} className={`rounded-lg border p-4 ${urgency === 'red' ? 'border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/5' : 'border-zinc-200 dark:border-zinc-800'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant={urgencyToVariant(d.urgency)}>{days === 0 ? 'Today' : days < 0 ? 'Overdue' : `${days}d`}</Badge>
                              <Badge variant="grey">{CATEGORY_LABELS[d.category] || d.category}</Badge>
                            </div>
                            <p className="font-medium text-sm">{d.title}</p>
                            <p className="text-xs text-zinc-400 mt-0.5">{format(new Date(d.due_date), 'EEE d MMM, HH:mm')}</p>
                            {d.due_saudi_time && <p className="text-xs text-zinc-400">Saudi: {d.due_saudi_time}</p>}
                            {d.first_step && <p className="text-xs text-zinc-500 mt-1.5">First step: {d.first_step}</p>}
                            {d.consequence && <p className="text-xs text-red-500 dark:text-red-400 mt-1">If missed: {d.consequence}</p>}
                          </div>
                          <button onClick={() => markDone(d.id)} className="text-xs text-zinc-400 hover:text-green-600 transition-colors shrink-0 mt-0.5">✓ Done</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
