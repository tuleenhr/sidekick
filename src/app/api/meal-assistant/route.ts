import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, MEAL_ASSISTANT_PROMPT } from '@/lib/claude'

export async function GET() {
  const { data } = await supabaseAdmin.from('meal_context').select('*')
  const ctx = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]))
  return NextResponse.json(ctx)
}

export async function POST(req: NextRequest) {
  const { request } = await req.json()
  if (!request?.trim()) return NextResponse.json({ error: 'No request' }, { status: 400 })

  const { data: ctxRows } = await supabaseAdmin.from('meal_context').select('*')
  const ctx = Object.fromEntries((ctxRows || []).map((r: any) => [r.key, r.value]))

  // Detect fridge update
  const isUpdate = /i (just |have |bought|got|picked up|added|now have)|my fridge|update.*fridge|fridge.*update/i.test(request)

  if (isUpdate) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: PERSONA_PROMPT,
        messages: [{
          role: 'user',
          content: MEAL_ASSISTANT_PROMPT({ request, fridge_items: ctx.fridge_items || '', staples: ctx.staples || '', preferences: ctx.preferences || '', shopping_needs: ctx.shopping_needs || '' }),
        }],
      })

      const reply = (response.content[0] as any).text || ''

      // Extract mentioned ingredients and update fridge
      const extractRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: 'Extract a comma-separated list of ingredients mentioned in this fridge update. Return ONLY the list, nothing else.',
        messages: [{ role: 'user', content: request }],
      })
      const newItems = (extractRes.content[0] as any).text || ''
      const combined = [ctx.fridge_items, newItems].filter(Boolean).join(', ')
      await supabaseAdmin.from('meal_context').upsert({ key: 'fridge_items', value: combined }, { onConflict: 'key' })

      return NextResponse.json({ response: reply, fridge_updated: true })
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 })
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: PERSONA_PROMPT,
      messages: [{
        role: 'user',
        content: MEAL_ASSISTANT_PROMPT({
          request,
          fridge_items: ctx.fridge_items || '',
          staples: ctx.staples || '',
          preferences: ctx.preferences || '',
          shopping_needs: ctx.shopping_needs || '',
        }),
      }],
    })

    const reply = (response.content[0] as any).text || ''
    return NextResponse.json({ response: reply })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { key, value } = await req.json()
  const { data, error } = await supabaseAdmin
    .from('meal_context')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
    .single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
