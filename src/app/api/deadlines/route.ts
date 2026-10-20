import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, WIN_DETECTION_PROMPT } from '@/lib/claude'

function toSaudiTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' AST'
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('deadlines')
    .select('*')
    .neq('status', 'done')
    .order('due_date')

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const due_saudi_time = body.due_date ? toSaudiTime(body.due_date) : null

  const { data, error } = await supabaseAdmin
    .from('deadlines')
    .insert({ ...body, due_saudi_time })
    .select()
    .single()

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (updates.due_date) updates.due_saudi_time = toSaudiTime(updates.due_date)

  const { data, error } = await supabaseAdmin
    .from('deadlines')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error }, { status: 500 })

  // Win detection when marking a deadline done
  if (updates.status === 'done' && data) {
    try {
      const content = `Completed deadline: ${data.title}${data.consequence ? ` (consequence of missing: ${data.consequence})` : ''}`
      const winRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: PERSONA_PROMPT,
        messages: [{ role: 'user', content: WIN_DETECTION_PROMPT(content) }],
      })
      const raw = winRes.content[0].type === 'text' ? winRes.content[0].text : '{}'
      const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
      const result = JSON.parse(text)
      if (result.win_found) {
        const win = await supabaseAdmin.from('confidence_entries').insert({
          title: result.title,
          category: result.category || 'admin',
          detail: result.detail,
          source: 'deadline_done',
          source_ref: id,
        }).select().single()
        return NextResponse.json({ ...data, win: win.data })
      }
    } catch { /* optional */ }
  }

  return NextResponse.json(data)
}
