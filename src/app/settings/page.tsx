'use client'

import { useEffect, useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'

const DEFAULT_CATEGORIES = ['KCL', 'UCSD', 'Global Mobility', 'internships', 'housing', 'admin']

const PACKING_QUESTIONS = [
  { key: 'always_bring', question: "What do you never travel without? Think documents, tech, comfort items." },
  { key: 'always_forget', question: "What do you consistently forget or wish you'd brought?" },
  { key: 'travel_style', question: "How do you pack — light and minimal, or do you like having options?" },
  { key: 'tech_always', question: "What devices and cables do you always need?" },
  { key: 'toiletries_approach', question: "Toiletries — full kit every time, or do you buy things at the destination?" },
  { key: 'riyadh_specifics', question: "Anything specific to your Riyadh trips that's different from other travel?" },
  { key: 'london_specifics', question: "Anything specific to your London trips?" },
]

function PackingProfileOnboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function next() {
    if (!current.trim()) return
    const key = PACKING_QUESTIONS[step].key
    const newAnswers = { ...answers, [key]: current }
    setAnswers(newAnswers)
    setSaving(true)
    await fetch('/api/packing-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: current }),
    })
    setSaving(false)
    setCurrent('')
    if (step + 1 >= PACKING_QUESTIONS.length) {
      setDone(true)
    } else {
      setStep(step + 1)
    }
  }

  if (done) return (
    <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50/30 dark:bg-green-900/5 p-4 space-y-2">
      <p className="text-sm font-medium">Profile saved ✓</p>
      <p className="text-xs text-zinc-500">Every packing list from now on is built around this.</p>
      <button onClick={onComplete} className="text-xs text-zinc-400 hover:text-zinc-600">Dismiss</button>
    </div>
  )

  const q = PACKING_QUESTIONS[step]
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">{step + 1} of {PACKING_QUESTIONS.length}</p>
        <div className="flex gap-1">
          {PACKING_QUESTIONS.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= step ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-700'}`} />)}
        </div>
      </div>
      <p className="text-sm font-medium">{q.question}</p>
      <textarea
        autoFocus
        className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none min-h-[70px]"
        placeholder="Type your answer..."
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); next() } }}
      />
      <button onClick={next} disabled={saving || !current.trim()} className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm py-2.5 rounded-lg font-medium hover:opacity-80 disabled:opacity-40">
        {saving ? 'Saving...' : step + 1 === PACKING_QUESTIONS.length ? 'Finish' : 'Next →'}
      </button>
    </div>
  )
}

function PackingProfileEdit({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/packing-profile').then((r) => r.json()).then(setProfile)
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/packing-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-3">
      {PACKING_QUESTIONS.map((q) => (
        <div key={q.key}>
          <label className="text-xs text-zinc-400 block mb-1">{q.question}</label>
          <textarea
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none min-h-[50px]"
            value={profile[q.key] || ''}
            onChange={(e) => setProfile((p) => ({ ...p, [q.key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm py-2 rounded-lg font-medium hover:opacity-80 disabled:opacity-40">
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save profile'}
        </button>
        <button onClick={onClose} className="px-4 text-sm text-zinc-500">Cancel</button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState({
    location: 'riyadh',
    current_focus: '',
    caldav_user: '',
    caldav_password: '',
    email_categories: DEFAULT_CATEGORIES.join(', '),
    tone_notes: '',
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [packingProfile, setPackingProfile] = useState<Record<string, string>>({})
  const [showPackingOnboarding, setShowPackingOnboarding] = useState(false)
  const [editingPacking, setEditingPacking] = useState(false)
  const [homeCtx, setHomeCtx] = useState<Record<string, string>>({})
  const [homeForm, setHomeForm] = useState({ move_out_date: '', move_out_destination: '', upcoming_guests: '', recurring_issues: '' })
  const [homeSaved, setHomeSaved] = useState(false)
  const [movingOut, setMovingOut] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/packing-profile').then((r) => r.json()),
      fetch('/api/home-context').then((r) => r.json()),
    ]).then(([s, pp, hc]) => {
      setSettings((prev) => ({ ...prev, ...s, caldav_password: '', email_categories: s.email_categories || DEFAULT_CATEGORIES.join(', ') }))
      setPackingProfile(pp)
      setHomeCtx(hc)
      setHomeForm({
        move_out_date: hc.move_out_date || '',
        move_out_destination: hc.move_out_destination || '',
        upcoming_guests: hc.upcoming_guests || '',
        recurring_issues: hc.recurring_issues || '',
      })
      // Show onboarding if packing profile is empty
      const hasProfile = Object.values(pp).some((v) => typeof v === 'string' && v.length > 0)
      if (!hasProfile) setShowPackingOnboarding(true)
    })
  }, [])

  async function save() {
    setSaving(true)
    const payload: Record<string, string> = { ...settings }
    if (!payload.caldav_password) delete payload.caldav_password
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveHome() {
    setMovingOut(true)
    await fetch('/api/home-context', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(homeForm),
    })
    // If move_out_date is new, seed the task list
    if (homeForm.move_out_date && !homeCtx.move_out_date) {
      await fetch('/api/move-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: true, move_out_date: homeForm.move_out_date }),
      })
    }
    setHomeCtx((prev) => ({ ...prev, ...homeForm }))
    setHomeSaved(true)
    setMovingOut(false)
    setTimeout(() => setHomeSaved(false), 2000)
  }

  const hasPackingProfile = Object.values(packingProfile).some((v) => typeof v === 'string' && v.length > 0)

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* Gmail */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Gmail</h2>
        {session ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{session.user?.name}</p>
              <p className="text-xs text-zinc-400">{session.user?.email}</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Connected ✓</p>
            </div>
            <button onClick={() => signOut()} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">Disconnect</button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <p className="text-sm text-zinc-500">Connect Gmail to triage emails and draft replies.</p>
            <button onClick={() => signIn('google')} className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm px-4 py-2 rounded-lg hover:opacity-80 transition-opacity">Connect Google account</button>
          </div>
        )}
      </section>

      {/* Apple Calendar */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Apple iCloud Calendar</h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <p className="text-xs text-zinc-500">Generate an app-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords.</p>
          <input placeholder="Apple ID (email)" value={settings.caldav_user} onChange={(e) => setSettings((s) => ({ ...s, caldav_user: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          <input type="password" placeholder="App-specific password (xxxx-xxxx-xxxx-xxxx)" value={settings.caldav_password} onChange={(e) => setSettings((s) => ({ ...s, caldav_password: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" />
        </div>
      </section>

      {/* Travel */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Travel</h2>

        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Home airport</label>
          <select
            value={packingProfile.home_airport || 'Heathrow'}
            onChange={(e) => {
              setPackingProfile((p) => ({ ...p, home_airport: e.target.value }))
              fetch('/api/packing-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ home_airport: e.target.value }) })
            }}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none"
          >
            <option value="Heathrow">Heathrow (LHR)</option>
            <option value="Gatwick">Gatwick (LGW)</option>
            <option value="Stansted">Stansted (STN)</option>
            <option value="Luton">Luton (LTN)</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-zinc-400">Packing profile</p>
            {hasPackingProfile && !editingPacking && (
              <button onClick={() => setEditingPacking(true)} className="text-xs text-zinc-400 hover:text-zinc-600">Edit</button>
            )}
          </div>
          {showPackingOnboarding && !hasPackingProfile ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Set up your packing profile — takes about 5 minutes, makes every trip better.</p>
              </div>
              <PackingProfileOnboarding onComplete={() => { setShowPackingOnboarding(false); fetch('/api/packing-profile').then((r) => r.json()).then(setPackingProfile) }} />
            </div>
          ) : editingPacking ? (
            <PackingProfileEdit onClose={() => setEditingPacking(false)} />
          ) : hasPackingProfile ? (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-xs text-zinc-500">Profile set ✓ — used to generate personalised packing lists for every trip.</p>
            </div>
          ) : (
            <button onClick={() => setShowPackingOnboarding(true)} className="text-sm text-zinc-500 hover:text-zinc-700 underline">Set up packing profile →</button>
          )}
        </div>
      </section>

      {/* Home */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Home</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Move-out date</label>
            <input
              type="date"
              value={homeForm.move_out_date}
              onChange={(e) => setHomeForm((f) => ({ ...f, move_out_date: e.target.value }))}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <p className="text-xs text-zinc-400 mt-1">Setting this activates move-out mode — a staged task list appears in Deadlines.</p>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Moving to</label>
            <input
              placeholder="e.g. Riyadh (family home), San Diego (UCSD)"
              value={homeForm.move_out_destination}
              onChange={(e) => setHomeForm((f) => ({ ...f, move_out_destination: e.target.value }))}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Upcoming guests</label>
            <input
              placeholder="e.g. Mum and Dad, July 18"
              value={homeForm.upcoming_guests}
              onChange={(e) => setHomeForm((f) => ({ ...f, upcoming_guests: e.target.value }))}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Recurring home issues</label>
            <input
              placeholder="e.g. laundry always piles up, trash is always late"
              value={homeForm.recurring_issues}
              onChange={(e) => setHomeForm((f) => ({ ...f, recurring_issues: e.target.value }))}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
          <button onClick={saveHome} disabled={movingOut} className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm py-2.5 rounded-lg font-medium hover:opacity-80 disabled:opacity-50">
            {movingOut ? 'Saving...' : homeSaved ? 'Saved ✓' : 'Save home settings'}
          </button>
        </div>
      </section>

      {/* Location */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Location</h2>
        <div className="flex gap-2">
          {['london', 'riyadh', 'other'].map((loc) => (
            <button key={loc} onClick={() => setSettings((s) => ({ ...s, location: loc }))} className={`flex-1 py-2 text-sm rounded-lg border transition-colors capitalize ${settings.location === loc ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'}`}>
              {loc.charAt(0).toUpperCase() + loc.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400">Affects prayer times in your daily brief.</p>
      </section>

      {/* What you're working on */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">What you're working on</h2>
        <textarea placeholder="e.g. KBS application due 3 July, UCSD year abroad prep, internship search" value={settings.current_focus} onChange={(e) => setSettings((s) => ({ ...s, current_focus: e.target.value }))} rows={3} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none" />
        <p className="text-xs text-zinc-400">Injected into every brief and chat session.</p>
      </section>

      {/* Email categories */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Email categories to monitor</h2>
        <input placeholder="KCL, UCSD, Global Mobility, internships, housing, admin" value={settings.email_categories} onChange={(e) => setSettings((s) => ({ ...s, email_categories: e.target.value }))} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400" />
        <p className="text-xs text-zinc-400">Comma-separated. Claude uses these to prioritise triage.</p>
      </section>

      {/* Tone preferences */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Tone & style notes</h2>
        <textarea placeholder="e.g. Don't use formal language. Keep it short. Push me when I'm procrastinating." value={settings.tone_notes} onChange={(e) => setSettings((s) => ({ ...s, tone_notes: e.target.value }))} rows={2} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none" />
        <p className="text-xs text-zinc-400">Injected into every Claude call.</p>
      </section>

      <button onClick={save} disabled={saving} className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm py-3 rounded-lg font-medium hover:opacity-80 transition-opacity disabled:opacity-50">
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save settings'}
      </button>
    </div>
  )
}
