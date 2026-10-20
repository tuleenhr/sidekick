import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { addDays, format } from 'date-fns'

function calcNextDue(lastDone: string, recurrenceNote: string): string | null {
  if (!lastDone) return null
  const d = new Date(lastDone)
  const note = recurrenceNote?.toLowerCase() || ''
  const days = note.includes('3-4') || note.includes('3') ? 4
    : note.includes('4-5') || note.includes('4') ? 5
    : note.includes('weekly') || note.includes('week') ? 7
    : note.includes('daily') ? 1
    : 5
  return format(addDays(d, days), 'yyyy-MM-dd')
}

export async function GET() {
  const { data } = await supabaseAdmin.from('home_tasks').select('*').neq('status', 'done').order('next_due')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (body.last_done && body.recurrence_note) {
    body.next_due = calcNextDue(body.last_done, body.recurrence_note)
  }
  const { data, error } = await supabaseAdmin.from('home_tasks').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (updates.last_done && updates.recurrence_note) {
    updates.next_due = calcNextDue(updates.last_done, updates.recurrence_note)
  }
  const { data, error } = await supabaseAdmin.from('home_tasks').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
