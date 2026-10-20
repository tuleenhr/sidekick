import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { differenceInDays } from 'date-fns'

export async function GET() {
  const { data } = await supabaseAdmin.from('home_context').select('key, value')
  return NextResponse.json(Object.fromEntries((data || []).map((r: any) => [r.key, r.value])))
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const entries = Object.entries(body)

  await Promise.all(
    entries.map(([key, value]) =>
      supabaseAdmin.from('home_context').upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    )
  )

  // Auto-activate move_out_mode if move_out_date is within 60 days
  if (body.move_out_date) {
    const daysUntil = differenceInDays(new Date(body.move_out_date), new Date())
    const mode = daysUntil <= 60 && daysUntil > 0 ? 'true' : 'false'
    await supabaseAdmin.from('home_context').upsert({ key: 'move_out_mode', value: mode, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }

  return NextResponse.json({ ok: true })
}
