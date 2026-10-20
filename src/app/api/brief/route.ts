import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, BRIEF_PROMPT, LIFE_AREA_PROMPT, FRICTION_PROMPT } from '@/lib/claude'
import { fetchRecentThreads } from '@/lib/gmail'
import { fetchICloudEvents } from '@/lib/caldav'
import { formatPrayerTimesForBrief } from '@/lib/prayer'
import { loadMemory, formatMemoryForPrompt } from '@/lib/memory'
import { fetchWeather, formatWeatherForPrompt } from '@/lib/weather'
import { format, addDays } from 'date-fns'

function stripJSON(raw: string) {
  return raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const today = format(new Date(), 'yyyy-MM-dd')

    const { data: existing } = await supabaseAdmin
      .from('briefings')
      .select('*')
      .eq('date', today)
      .single()

    if (existing) return NextResponse.json(existing)

    const [deadlinesRes, loopsRes, contextRes, waitingOnRes, yesterdayBriefRes, lifeAreasRes] = await Promise.all([
      supabaseAdmin.from('deadlines').select('*').neq('status', 'done').order('due_date').limit(10),
      supabaseAdmin.from('open_loops').select('*').eq('status', 'open').order('urgency').limit(15),
      supabaseAdmin.from('user_context').select('*'),
      supabaseAdmin.from('waiting_on').select('*').eq('status', 'waiting').lte('follow_up_date', today).limit(5),
      supabaseAdmin.from('briefings').select('brief_paragraph, priorities').lt('date', today).order('date', { ascending: false }).limit(1).single(),
      supabaseAdmin.from('life_areas').select('area, risk_level, risk_note').neq('risk_level', 'green'),
    ])

    const deadlines = deadlinesRes.data || []
    const loops = loopsRes.data || []
    const contextMap = Object.fromEntries((contextRes.data || []).map((r: any) => [r.key, r.value]))
    const waitingOn = waitingOnRes.data || []
    const location = contextMap['location'] || 'london'

    // Fetch calendar
    let calendarEvents = 'No calendar connected'
    if (contextMap['caldav_password'] && contextMap['caldav_user']) {
      try {
        const events = await fetchICloudEvents(contextMap['caldav_user'], contextMap['caldav_password'])
        // Also get next 14 days for life area monitoring
        calendarEvents = events.length
          ? events.map((e) => {
              const t = e.allDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })
              return `${e.title} at ${t}`
            }).join(', ')
          : 'No events today'
      } catch {
        calendarEvents = 'Calendar unavailable'
      }
    }

    // Fetch Gmail
    let emailSummaries = 'No Gmail connected'
    if (session?.accessToken) {
      try {
        const threads = await fetchRecentThreads(session.accessToken as string, 10)
        emailSummaries = threads.slice(0, 8).map((t) => `From: ${t.sender} | ${t.subject} | ${t.snippet.slice(0, 120)}`).join('\n')
      } catch {
        emailSummaries = 'Gmail unavailable'
      }
    }

    // Weather
    const weather = await fetchWeather(location)
    const weatherStr = formatWeatherForPrompt(weather)

    const prayerTimes = formatPrayerTimesForBrief(location)
    const currentTime = new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

    const prevBrief = yesterdayBriefRes?.data as any
    const unfinishedTasks = prevBrief?.priorities
      ? (prevBrief.priorities as any[]).map((p: any) => p.task).join(', ')
      : 'None'

    const waitingOnStr = waitingOn.length
      ? waitingOn.map((w: any) => `${w.title} — follow up due ${w.follow_up_date}`).join('\n')
      : 'None overdue'

    const redAreas = lifeAreasRes.data || []
    const lifeAreaStr = redAreas.length
      ? redAreas.map((a: any) => `${a.area}: ${a.risk_level} — ${a.risk_note}`).join('\n')
      : 'All areas green'

    const memories = await loadMemory()
    const memoryBlock = formatMemoryForPrompt(memories)
    const toneNotes = contextMap['tone_notes']

    const system = `${PERSONA_PROMPT}${toneNotes ? `\n\nTone notes: ${toneNotes}` : ''}${memoryBlock}`

    const prompt = BRIEF_PROMPT({
      current_time: `${currentTime} | Prayer times: ${prayerTimes}`,
      location: location.charAt(0).toUpperCase() + location.slice(1),
      calendar_events: calendarEvents,
      email_summaries: emailSummaries,
      deadlines: deadlines.map((d: any) => `${d.title} — due ${d.due_date} (${d.category}, ${d.urgency})`).join('\n') || 'None',
      open_loops: loops.map((l: any) => `${l.title} (${l.bucket || 'unknown'})`).join('\n') || 'None',
      unfinished_tasks: unfinishedTasks,
      current_context: contextMap['current_focus'] || 'KBS application, UCSD prep, internship search',
      waiting_on: waitingOnStr,
      weather: weatherStr,
      tone_notes: toneNotes,
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (response.content[0] as any).text || '{}'
    const briefData = JSON.parse(stripJSON(raw))

    const { brief_paragraph, priorities, day_plan } = briefData
    const { data: stored, error } = await supabaseAdmin
      .from('briefings')
      .insert({
        date: today,
        brief_paragraph,
        priorities,
        day_plan,
        raw_input_snapshot: { deadlines_count: deadlines.length, loops_count: loops.length, location, weather },
      })
      .select()
      .single()

    if (error) throw error

    // Background: friction → consequences, life area monitoring
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    if (stored && briefData.priorities?.length) {
      fetch(`${baseUrl}/api/friction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefingId: stored.id, priorities: briefData.priorities }),
      }).catch(() => {})
    }

    // Background life area update — only if not already run today
    const { data: recentAreaUpdate } = await supabaseAdmin
      .from('life_areas')
      .select('updated_at')
      .gte('updated_at', `${today}T00:00:00`)
      .limit(1)
      .single()

    if (!recentAreaUpdate) {
      runLifeAreaUpdate({
      deadlines: deadlines.map((d: any) => `${d.title} (due ${d.due_date}, ${d.urgency})`).join('\n') || 'None',
      loops: loops.map((l: any) => l.title).join('\n') || 'None',
      email_summaries: emailSummaries,
      waiting_on: waitingOnStr,
      calendar: calendarEvents,
    }).catch(() => {})
    }

    return NextResponse.json(stored)
  } catch (error) {
    console.error('Brief generation error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

async function runLifeAreaUpdate(data: {
  deadlines: string
  loops: string
  email_summaries: string
  waiting_on: string
  calendar: string
}) {
  try {
    const { data: lifeAreas } = await supabaseAdmin.from('life_areas').select('area, last_activity, risk_level')
    const lastActivityStr = (lifeAreas || [])
      .map((a: any) => `${a.area}: last active ${a.last_activity ? format(new Date(a.last_activity), 'dd MMM') : 'never'}, currently ${a.risk_level}`)
      .join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: PERSONA_PROMPT,
      messages: [{ role: 'user', content: LIFE_AREA_PROMPT({ ...data, last_activity: lastActivityStr }) }],
    })

    const raw = (response.content[0] as any).text || '[]'
    const areas: any[] = JSON.parse(stripJSON(raw))

    for (const area of areas) {
      await supabaseAdmin.from('life_areas').update({
        risk_level: area.risk_level,
        risk_note: area.risk_note,
        open_items: area.open_items,
        last_reviewed: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('area', area.area)
    }
  } catch (e) {
    console.error('Life area update failed:', e)
  }
}

export async function DELETE() {
  const today = format(new Date(), 'yyyy-MM-dd')
  await supabaseAdmin.from('briefings').delete().eq('date', today)
  return GET()
}
