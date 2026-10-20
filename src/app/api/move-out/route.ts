import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { format, addDays, differenceInWeeks } from 'date-fns'

const MOVE_OUT_TEMPLATE = [
  // Stage 1 — Admin (now)
  { title: 'Give notice to landlord', category: 'admin', stage: 1 },
  { title: 'Check lease end date and notice period', category: 'admin', stage: 1 },
  { title: 'Forward mail / update address', category: 'admin', stage: 1 },
  { title: 'Cancel or transfer internet', category: 'admin', stage: 1 },
  { title: 'Cancel or transfer council tax', category: 'admin', stage: 1 },
  { title: 'Cancel or transfer utilities', category: 'admin', stage: 1 },
  // Stage 2 — Declutter (4 weeks before)
  { title: 'Go through clothes — keep, donate, ship', category: 'packing', stage: 2 },
  { title: 'Clear out any furniture or large items', category: 'arranging', stage: 2 },
  { title: 'Things to sell or give away — list and action', category: 'packing', stage: 2 },
  { title: 'Decide what ships to Riyadh vs goes to new place', category: 'packing', stage: 2 },
  { title: 'Deep clean areas as you empty them', category: 'cleaning', stage: 2 },
  // Stage 3 — Packing (2 weeks before)
  { title: 'Pack non-essentials first', category: 'packing', stage: 3 },
  { title: 'Label boxes by destination', category: 'packing', stage: 3 },
  { title: 'Keep daily-use items accessible — pack last', category: 'packing', stage: 3 },
  { title: 'Return any borrowed items', category: 'returning', stage: 3 },
  // Stage 4 — Handover (final week)
  { title: 'Final clean (or book cleaner)', category: 'cleaning', stage: 4 },
  { title: 'Inventory check vs move-in inventory', category: 'admin', stage: 4 },
  { title: 'Photograph everything before leaving', category: 'admin', stage: 4 },
  { title: 'Final meter readings', category: 'admin', stage: 4 },
  { title: 'Return keys', category: 'returning', stage: 4 },
]

export async function GET() {
  const { data } = await supabaseAdmin.from('move_out_tasks').select('*').order('stage').order('created_at')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // If seeding from move_out_date, generate the full task list
  if (body.seed && body.move_out_date) {
    const moveOut = new Date(body.move_out_date)
    const weeksAway = differenceInWeeks(moveOut, new Date())

    const tasks = MOVE_OUT_TEMPLATE.map((t) => ({
      ...t,
      deadline: t.stage === 1 ? format(new Date(), 'yyyy-MM-dd')
        : t.stage === 2 ? format(addDays(moveOut, -28), 'yyyy-MM-dd')
        : t.stage === 3 ? format(addDays(moveOut, -14), 'yyyy-MM-dd')
        : format(addDays(moveOut, -7), 'yyyy-MM-dd'),
    }))

    const { data, error } = await supabaseAdmin.from('move_out_tasks').insert(tasks).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin.from('move_out_tasks').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabaseAdmin.from('move_out_tasks').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
