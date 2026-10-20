import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('life_areas')
    .select('*')
    .order('area')
  return NextResponse.json(data || [])
}
