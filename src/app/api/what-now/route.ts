import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, WHAT_NOW_PROMPT } from '@/lib/claude'
import { format } from 'date-fns'

function getTimeOfDay(hour: number) {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { optional_energy } = body

  const now = new Date()
  const hour = now.getHours()
  const today = format(now, 'yyyy-MM-dd')
  const currentTime = now.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const timeOfDay = getTimeOfDay(hour)

  const [briefRes, logsRes, chatRes] = await Promise.all([
    supabaseAdmin.from('briefings').select('brief_paragraph, priorities, day_plan').eq('date', today).single(),
    supabaseAdmin.from('what_now_log').select('inferred_energy, response_given').order('triggered_at', { ascending: false }).limit(7),
    supabaseAdmin.from('chat_messages').select('content').eq('role', 'user').gte('created_at', `${today}T00:00:00`).limit(5),
  ])

  const brief = briefRes.data as any
  const priorities = brief?.priorities || []
  const dayPlan = brief?.day_plan || []
  const recentLogs = logsRes.data || []
  const chatToday = chatRes.data || []

  // Infer energy from signals
  const signals: string[] = []
  let inferred_energy = optional_energy || 'unknown'

  if (!optional_energy) {
    if (hour < 10) signals.push('early morning — energy typically low')
    else if (hour >= 14 && hour <= 17) signals.push('afternoon — typically higher energy')
    else if (hour >= 21) signals.push('late evening')

    if (chatToday.length >= 3) signals.push('active in chat today — engaged')
    else if (chatToday.length === 0 && hour > 14) signals.push('no chat activity today — possibly low energy')

    const recentEnergy = recentLogs.slice(0, 3).map((l: any) => l.inferred_energy).filter(Boolean)
    if (recentEnergy.length) signals.push(`recent pattern: ${recentEnergy.join(', ')}`)

    if (signals.length < 2) {
      return NextResponse.json({ needs_input: true })
    }

    if (signals.some(s => s.includes('low') || s.includes('late'))) inferred_energy = 'low'
    else if (signals.some(s => s.includes('afternoon') || s.includes('engaged'))) inferred_energy = 'medium'
  }

  const prioritiesStr = priorities.map((p: any) => `- ${p.task} (${p.estimated_minutes}min)`).join('\n') || 'None set'
  const dayPlanStr = dayPlan.map((b: any) => `${b.time}: ${b.block}`).join('\n') || 'No day plan'

  const patternNote = recentLogs.length >= 3
    ? `Recent what-now responses: ${recentLogs.slice(0, 3).map((l: any) => l.response_given?.slice(0, 80)).join(' | ')}`
    : undefined

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: PERSONA_PROMPT,
      messages: [{
        role: 'user',
        content: WHAT_NOW_PROMPT({
          time: currentTime,
          priorities: prioritiesStr,
          completed: 'Unknown',
          day_plan: dayPlanStr,
          energy: inferred_energy,
          signals: signals.join(', ') || 'no clear signals',
          pattern_note: patternNote,
        }),
      }],
    })

    const raw = (response.content[0] as any).text || '{}'
    const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const result = JSON.parse(text)

    // Log for learning
    await supabaseAdmin.from('what_now_log').insert({
      time_of_day: timeOfDay,
      inferred_energy,
      signals_used: signals,
      response_given: result.response,
      context_snapshot: { priorities_count: priorities.length, hour, chat_activity: chatToday.length },
    })

    return NextResponse.json({ ...result, needs_input: false })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
