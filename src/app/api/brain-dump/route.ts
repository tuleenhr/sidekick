import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, BRAIN_DUMP_PROMPT } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const { input, input_type = 'text' } = await req.json()
  if (!input?.trim()) return NextResponse.json({ error: 'No input' }, { status: 400 })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: PERSONA_PROMPT,
      messages: [{ role: 'user', content: BRAIN_DUMP_PROMPT(input) }],
    })

    const raw = (response.content[0] as any).text || '{}'
    const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const result = JSON.parse(text)

    const items = result.items || []
    const counts = { deadlines: 0, open_loops: 0, waiting_on: 0, calendar_events: 0, fake_urgency: 0, ideas: 0 }
    const created: any[] = []

    for (const item of items) {
      try {
        if (item.category === 'deadline') {
          await supabaseAdmin.from('deadlines').insert({
            title: item.title,
            due_date: item.date || null,
            category: 'admin',
            urgency: 'yellow',
            first_step: item.detail || null,
          })
          counts.deadlines++
          created.push({ ...item, created: true })
        } else if (item.category === 'open_loop') {
          await supabaseAdmin.from('open_loops').insert({
            title: item.title,
            bucket: 'admin',
            urgency: 'medium',
            status: 'open',
            first_step: item.detail || null,
          })
          counts.open_loops++
          created.push({ ...item, created: true })
        } else if (item.category === 'waiting_on') {
          await supabaseAdmin.from('waiting_on').insert({
            title: item.title,
            waiting_for: item.detail || 'unknown',
            context: input.slice(0, 500),
            sent_date: new Date().toISOString().split('T')[0],
            follow_up_date: item.follow_up_date || null,
            source: 'brain_dump',
          })
          counts.waiting_on++
          created.push({ ...item, created: true })
        } else if (item.category === 'fake_urgency') {
          counts.fake_urgency++
          created.push({ ...item, created: false })
        } else if (item.category === 'idea') {
          counts.ideas++
          created.push({ ...item, created: false })
        } else {
          created.push({ ...item, created: false })
        }
      } catch (e) {
        created.push({ ...item, created: false, error: String(e) })
      }
    }

    // Store brain dump entry
    await supabaseAdmin.from('brain_dump_entries').insert({
      raw_input: input,
      input_type,
      sorted_output: { items: created, counts, summary: result.summary },
    })

    return NextResponse.json({
      summary: result.summary,
      counts,
      items: created,
    })
  } catch (error) {
    console.error('Brain dump error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
