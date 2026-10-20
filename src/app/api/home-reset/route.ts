import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT } from '@/lib/claude'

function stripJSON(raw: string) {
  return raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
}

export async function POST(req: NextRequest) {
  const { description, time_available_minutes, guests_in_days } = await req.json()

  const { data: homeCtx } = await supabaseAdmin.from('home_context').select('key, value')
  const ctx = Object.fromEntries((homeCtx || []).map((r: any) => [r.key, r.value]))

  const prompt = `Tuleen's flat needs a reset. Give her a staged, non-overwhelming plan.

Current state: mess level ${ctx.current_mess_level || '3'}/5
What she said: "${description}"
Time available: ${time_available_minutes ? time_available_minutes + ' minutes' : 'not specified'}
Guests coming: ${guests_in_days ? `in ${guests_in_days} days` : 'no guests'}
Move-out date: ${ctx.move_out_date || 'not set'}
Move-out mode: ${ctx.move_out_mode}
Recurring issues: ${ctx.recurring_issues || 'none noted'}

Return a JSON object ONLY:
{
  "plan": [
    { "step": 1, "action": "Start with [specific room/area]", "time_minutes": 10, "why": "highest visual impact" },
    ...
  ],
  "not_now": ["things explicitly to NOT do right now — no reorganizing, no deep projects"],
  "move_out_action": "one move-out action to fold in if move_out_mode is true, null otherwise",
  "guest_stages": null or [{ "stage": "Today", "tasks": ["..."] }] if guests are coming
}

Rules:
- Start with highest visual impact (trash, visible surfaces, floor)
- Be specific about rooms and actions — never say "tidy up" or "deep clean"
- Keep each step under 15 minutes
- Max 5-6 steps
- If guests: work back from arrival, give stages by day
- If move-out: fold in one packing/declutter action naturally`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: PERSONA_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (res.content[0] as any).text || '{}'
  const plan = JSON.parse(stripJSON(raw))

  // Update mess level to reflect that a reset happened
  await supabaseAdmin.from('home_context').upsert({ key: 'current_mess_level', value: '1', updated_at: new Date().toISOString() }, { onConflict: 'key' })

  return NextResponse.json(plan)
}
