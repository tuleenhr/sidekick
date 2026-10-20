import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadMemory, extractAndSavePatterns } from '@/lib/memory'

export async function GET() {
  const memories = await loadMemory()
  return NextResponse.json(memories)
}

export async function POST() {
  const [historyRes, briefHistoryRes] = await Promise.all([
    supabaseAdmin.from('chat_messages').select('role, content').order('created_at').limit(100),
    supabaseAdmin.from('briefings').select('date, priorities, moved_to_later').order('date', { ascending: false }).limit(14),
  ])

  await extractAndSavePatterns(historyRes.data || [], briefHistoryRes.data || [])
  const memories = await loadMemory()
  return NextResponse.json({ extracted: memories.length, memories })
}

export async function DELETE() {
  // Deactivate all memories (soft delete)
  await supabaseAdmin.from('secretary_memory').update({ active: false }).eq('active', true)
  return NextResponse.json({ cleared: true })
}
