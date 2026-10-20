import { NextRequest, NextResponse } from 'next/server'
import { anthropic, PERSONA_PROMPT, FRICTION_PROMPT } from '@/lib/claude'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { briefingId, priorities } = await req.json()
    if (!priorities?.length) return NextResponse.json([])

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: PERSONA_PROMPT,
      messages: [{ role: 'user', content: FRICTION_PROMPT(priorities) }],
    })

    const raw = (response.content[0] as any).text || '[]'
    const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const consequenceData: any[] = JSON.parse(text)

    if (briefingId) {
      const { data: briefing } = await supabaseAdmin
        .from('briefings')
        .select('priorities')
        .eq('id', briefingId)
        .single()

      if (briefing?.priorities) {
        const updated = (briefing.priorities as any[]).map((p: any) => {
          const c = consequenceData.find((cd) => cd.task?.toLowerCase().trim() === p.task?.toLowerCase().trim())
          if (c?.consequence) return { ...p, consequence: c.consequence }
          return p
        })
        await supabaseAdmin.from('briefings').update({ priorities: updated }).eq('id', briefingId)
      }
    }

    return NextResponse.json(consequenceData)
  } catch (error) {
    console.error('Friction error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
