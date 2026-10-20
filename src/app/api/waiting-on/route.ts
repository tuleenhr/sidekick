import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, WAITING_ON_FOLLOW_UP_PROMPT } from '@/lib/claude'
import { differenceInBusinessDays, addBusinessDays, format } from 'date-fns'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('waiting_on')
    .select('*')
    .eq('status', 'waiting')
    .order('follow_up_date')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, waiting_for, context, sent_date, follow_up_days = 4, source, source_ref } = body

  const sentDateParsed = sent_date ? new Date(sent_date) : new Date()
  const follow_up_date = format(addBusinessDays(sentDateParsed, follow_up_days), 'yyyy-MM-dd')

  // Draft follow-up if context provided
  let follow_up_drafted: string | null = null
  if (context && waiting_for) {
    try {
      const days = differenceInBusinessDays(new Date(), sentDateParsed)
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: PERSONA_PROMPT,
        messages: [{ role: 'user', content: WAITING_ON_FOLLOW_UP_PROMPT({ context, waiting_for, days }) }],
      })
      follow_up_drafted = (res.content[0] as any).text || null
    } catch { /* optional */ }
  }

  const { data, error } = await supabaseAdmin
    .from('waiting_on')
    .insert({ title, waiting_for, context, sent_date: format(sentDateParsed, 'yyyy-MM-dd'), follow_up_date, follow_up_drafted, source, source_ref })
    .select()
    .single()

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabaseAdmin
    .from('waiting_on')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
