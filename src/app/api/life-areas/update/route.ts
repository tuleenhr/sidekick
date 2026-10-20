import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { area, risk_level, risk_note, open_items } = await req.json()
  const { data, error } = await supabaseAdmin
    .from('life_areas')
    .update({ risk_level, risk_note, open_items, last_activity: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('area', area)
    .select()
    .single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
