import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { id, status } = await req.json()

  await supabaseAdmin
    .from('email_triage')
    .update({ status })
    .eq('id', id)

  return NextResponse.json({ success: true })
}
