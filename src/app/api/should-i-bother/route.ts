import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, SHOULD_I_BOTHER_PROMPT } from '@/lib/claude'
import { format } from 'date-fns'

export async function POST(req: NextRequest) {
  const { input } = await req.json()
  if (!input?.trim()) return NextResponse.json({ error: 'No input' }, { status: 400 })

  const today = format(new Date(), 'yyyy-MM-dd')
  const currentTime = new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const [briefRes, deadlinesRes, lifeAreasRes] = await Promise.all([
    supabaseAdmin.from('briefings').select('brief_paragraph, priorities').eq('date', today).single(),
    supabaseAdmin.from('deadlines').select('title, due_date, urgency').neq('status', 'done').order('due_date').limit(5),
    supabaseAdmin.from('life_areas').select('area, risk_level, risk_note').neq('risk_level', 'green'),
  ])

  const brief = briefRes.data as any
  const priorities = brief?.priorities || []
  const deadlines = deadlinesRes.data || []
  const redAreas = lifeAreasRes.data || []

  const prioritiesStr = priorities.map((p: any) => `- ${p.task}`).join('\n') || 'None'
  const deadlinesStr = deadlines.map((d: any) => `${d.title} (due ${d.due_date})`).join(', ') || 'None'
  const areaRisksStr = redAreas.map((a: any) => `${a.area}: ${a.risk_level} — ${a.risk_note}`).join('\n') || 'All green'

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: PERSONA_PROMPT,
      messages: [{
        role: 'user',
        content: SHOULD_I_BOTHER_PROMPT({
          input,
          time: currentTime,
          priorities: prioritiesStr,
          area_risks: areaRisksStr,
          completed: 'Unknown',
          upcoming_deadlines: deadlinesStr,
        }),
      }],
    })

    const raw = (response.content[0] as any).text || '{}'
    const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return NextResponse.json(JSON.parse(text))
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
