import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data } = await supabaseAdmin.from('packing_profile').select('key, value')
  return NextResponse.json(Object.fromEntries((data || []).map((r: any) => [r.key, r.value])))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const entries = Object.entries(body)
  await Promise.all(
    entries.map(([key, value]) =>
      supabaseAdmin.from('packing_profile').upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    )
  )
  return NextResponse.json({ ok: true })
}
