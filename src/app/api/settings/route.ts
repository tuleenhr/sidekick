import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data } = await supabaseAdmin.from('user_context').select('*')
  const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]))
  return NextResponse.json(map)
}

export async function POST(req: NextRequest) {
  const settings = await req.json()

  const upserts = Object.entries(settings).map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }))

  await supabaseAdmin.from('user_context').upsert(upserts, { onConflict: 'key' })

  return NextResponse.json({ success: true })
}
