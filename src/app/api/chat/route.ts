import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT } from '@/lib/claude'
import { createICloudEvent, updateICloudEvent, deleteICloudEvent, fetchICloudEvents, listICloudCalendars } from '@/lib/caldav'
import { loadMemory, formatMemoryForPrompt } from '@/lib/memory'
import { format } from 'date-fns'

const TOOLS: any[] = [
  {
    name: 'add_deadline',
    description: 'Add a new deadline to track',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due_date: { type: 'string', description: 'ISO date string' },
        category: { type: 'string', enum: ['uni', 'career', 'admin', 'travel', 'personal'] },
        urgency: { type: 'string', enum: ['red', 'orange', 'yellow', 'grey'] },
        first_step: { type: 'string', description: 'The exact first step to take' },
        consequence: { type: 'string', description: 'What happens if this is missed' },
      },
      required: ['title', 'due_date', 'category'],
    },
  },
  {
    name: 'update_deadline',
    description: 'Update or mark a deadline as done',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        due_date: { type: 'string' },
        urgency: { type: 'string', enum: ['red', 'orange', 'yellow', 'grey'] },
        status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
        first_step: { type: 'string' },
        consequence: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_deadline',
    description: 'Remove a deadline permanently',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'add_open_loop',
    description: 'Add a new open loop / unresolved task to track',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        bucket: { type: 'string', enum: ['body', 'admin', 'growth', 'joy'] },
        urgency: { type: 'string', enum: ['red', 'orange', 'yellow', 'grey'] },
        relevant_this_week: { type: 'boolean' },
        first_step: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_open_loop',
    description: 'Update an open loop — change urgency, snooze, mark done',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        urgency: { type: 'string', enum: ['red', 'orange', 'yellow', 'grey'] },
        relevant_this_week: { type: 'boolean' },
        snoozed_until: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done', 'irrelevant'] },
        first_step: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_waiting_on',
    description: 'Track something Tuleen is waiting on — a reply, a confirmation, a result',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What she is waiting for' },
        waiting_for: { type: 'string', description: 'Who or what she is waiting on' },
        context: { type: 'string', description: 'Why she is waiting — what was sent or asked' },
        sent_date: { type: 'string', description: 'When she sent the message/email, ISO date' },
        follow_up_date: { type: 'string', description: 'When to follow up if no reply, ISO date' },
      },
      required: ['title', 'waiting_for'],
    },
  },
  {
    name: 'list_waiting_on',
    description: 'Get all things Tuleen is currently waiting on',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_waiting_on',
    description: 'Mark a waiting-on item as received or no longer needed',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['waiting', 'received', 'no_longer_needed'] },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'update_life_area',
    description: 'Update the risk level and notes for a life area after assessing it',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', enum: ['university', 'career', 'travel', 'home', 'health', 'finances', 'relationships', 'ucsd'] },
        risk_level: { type: 'string', enum: ['green', 'yellow', 'red'] },
        risk_note: { type: 'string', description: 'Why it is at this risk level, null if green' },
        open_items: { type: 'number' },
      },
      required: ['area', 'risk_level'],
    },
  },
  {
    name: 'get_life_areas',
    description: 'Get the current state of all 8 life areas with risk levels',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_meal_context',
    description: 'Update what is in the fridge or any meal preferences',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['fridge_items', 'shopping_needs', 'preferences'] },
        value: { type: 'string' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'update_home_context',
    description: "Update home status — use when she mentions doing laundry, taking out trash, flat is messy, guests coming, etc. Silently update, don't announce it.",
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['laundry_status', 'trash_status', 'dishes_status', 'current_mess_level', 'fridge_items', 'upcoming_guests', 'last_cleaned'] },
        value: { type: 'string', description: 'For mess_level: 1-5 (1=spotless, 5=disaster). For laundry/trash/dishes: done/overdue/pending. For guests: name + date.' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'add_home_task',
    description: 'Add a recurring or one-off home task to track',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: { type: 'string', enum: ['cleaning', 'laundry', 'shopping', 'maintenance', 'admin', 'other'] },
        due_date: { type: 'string', description: 'ISO date' },
        recurring: { type: 'boolean' },
        recurrence_days: { type: 'number', description: 'How many days between recurrences' },
        notes: { type: 'string' },
      },
      required: ['title', 'category'],
    },
  },
  {
    name: 'get_home_status',
    description: 'Get current home context — laundry, trash, mess level, guests, move-out status',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'rebuild_brief',
    description: "Delete and regenerate today's brief — use when she asks to replan her day",
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: [] },
  },
  {
    name: 'list_deadlines',
    description: 'Get the current list of deadlines with IDs — use before updating or deleting',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_open_loops',
    description: 'Get the current list of open loops with IDs — use before updating or deleting',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_calendars',
    description: 'List all available iCloud calendars',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_calendar_events',
    description: 'Get upcoming calendar events from iCloud',
    input_schema: {
      type: 'object',
      properties: { days_ahead: { type: 'number' } },
      required: [],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new event in iCloud Calendar. Proactively suggest this for tasks with due dates or that take 30+ minutes.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO datetime string' },
        end: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
        all_day: { type: 'boolean' },
        calendar_name: { type: 'string' },
        calendar_url: { type: 'string' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing iCloud Calendar event',
    input_schema: {
      type: 'object',
      properties: {
        event_url: { type: 'string' },
        event_etag: { type: 'string' },
        event_uid: { type: 'string' },
        original_title: { type: 'string' },
        original_start: { type: 'string' },
        original_end: { type: 'string' },
        original_all_day: { type: 'boolean' },
        new_title: { type: 'string' },
        new_start: { type: 'string' },
        new_end: { type: 'string' },
        new_description: { type: 'string' },
        new_location: { type: 'string' },
      },
      required: ['event_url', 'event_etag', 'event_uid', 'original_start', 'original_end'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete an event from iCloud Calendar',
    input_schema: {
      type: 'object',
      properties: {
        event_url: { type: 'string' },
        event_etag: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['event_url', 'event_etag'],
    },
  },
]

async function runTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case 'list_deadlines': {
        const { data } = await supabaseAdmin.from('deadlines').select('id, title, due_date, urgency, status, category').neq('status', 'done').order('due_date')
        return JSON.stringify(data || [])
      }
      case 'list_open_loops': {
        const { data } = await supabaseAdmin.from('open_loops').select('id, title, bucket, urgency, relevant_this_week, status').eq('status', 'open')
        return JSON.stringify(data || [])
      }
      case 'add_deadline': {
        const due_saudi_time = new Date(input.due_date).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' AST'
        const { data, error } = await supabaseAdmin.from('deadlines').insert({ ...input, source: 'chat', due_saudi_time }).select().single()
        if (error) return `Error: ${error.message}`
        return `Added deadline: "${data.title}" due ${data.due_date}`
      }
      case 'update_deadline': {
        const { id, ...updates } = input
        if (updates.due_date) updates.due_saudi_time = new Date(updates.due_date).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' AST'
        const { data, error } = await supabaseAdmin.from('deadlines').update(updates).eq('id', id).select().single()
        if (error) return `Error: ${error.message}`
        return `Updated deadline: "${data.title}"`
      }
      case 'delete_deadline': {
        const { error } = await supabaseAdmin.from('deadlines').delete().eq('id', input.id)
        if (error) return `Error: ${error.message}`
        return 'Deleted deadline'
      }
      case 'add_open_loop': {
        const { data, error } = await supabaseAdmin.from('open_loops').insert({ ...input, source: 'chat' }).select().single()
        if (error) return `Error: ${error.message}`
        return `Added: "${data.title}"`
      }
      case 'update_open_loop': {
        const { id, ...updates } = input
        updates.updated_at = new Date().toISOString()
        const { data, error } = await supabaseAdmin.from('open_loops').update(updates).eq('id', id).select().single()
        if (error) return `Error: ${error.message}`
        return `Updated: "${data.title}"`
      }
      case 'add_waiting_on': {
        const { data, error } = await supabaseAdmin.from('waiting_on').insert({ ...input, source: 'chat' }).select().single()
        if (error) return `Error: ${error.message}`
        return `Added waiting-on: "${data.title}" — follow up ${data.follow_up_date || 'date TBD'}`
      }
      case 'list_waiting_on': {
        const { data } = await supabaseAdmin.from('waiting_on').select('id, title, waiting_for, follow_up_date, sent_date, follow_up_drafted').eq('status', 'waiting').order('follow_up_date')
        return JSON.stringify(data || [])
      }
      case 'update_waiting_on': {
        const { data, error } = await supabaseAdmin.from('waiting_on').update({ status: input.status, updated_at: new Date().toISOString() }).eq('id', input.id).select().single()
        if (error) return `Error: ${error.message}`
        return `Updated waiting-on: "${data.title}" → ${data.status}`
      }
      case 'get_life_areas': {
        const { data } = await supabaseAdmin.from('life_areas').select('area, risk_level, risk_note, open_items, last_reviewed').order('area')
        return JSON.stringify(data || [])
      }
      case 'update_life_area': {
        const { data, error } = await supabaseAdmin.from('life_areas').update({ risk_level: input.risk_level, risk_note: input.risk_note, open_items: input.open_items, updated_at: new Date().toISOString() }).eq('area', input.area).select().single()
        if (error) return `Error: ${error.message}`
        return `Updated ${data.area} → ${data.risk_level}`
      }
      case 'update_meal_context': {
        const { error } = await supabaseAdmin.from('meal_context').upsert({ key: input.key, value: input.value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        if (error) return `Error: ${error.message}`
        return `Updated meal context: ${input.key}`
      }
      case 'update_home_context': {
        const { error } = await supabaseAdmin.from('home_context').upsert({ key: input.key, value: input.value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        if (error) return `Error: ${error.message}`
        return `Updated home context: ${input.key} = ${input.value}`
      }
      case 'add_home_task': {
        const { data, error } = await supabaseAdmin.from('home_tasks').insert({ ...input, status: 'pending' }).select().single()
        if (error) return `Error: ${error.message}`
        return `Added home task: "${data.title}"`
      }
      case 'get_home_status': {
        const { data } = await supabaseAdmin.from('home_context').select('key, value')
        return JSON.stringify(Object.fromEntries((data || []).map((r: any) => [r.key, r.value])))
      }
      case 'rebuild_brief': {
        const today = format(new Date(), 'yyyy-MM-dd')
        await supabaseAdmin.from('briefings').delete().eq('date', today)
        return 'Brief deleted — will regenerate when Today page opens.'
      }
      case 'list_calendars': {
        const { data: ctx } = await supabaseAdmin.from('user_context').select('*')
        const ctxMap = Object.fromEntries((ctx || []).map((r: any) => [r.key, r.value]))
        if (!ctxMap['caldav_user'] || !ctxMap['caldav_password']) return 'iCloud Calendar not connected.'
        const cals = await listICloudCalendars(ctxMap['caldav_user'], ctxMap['caldav_password'])
        return JSON.stringify(cals)
      }
      case 'list_calendar_events': {
        const { data: ctx } = await supabaseAdmin.from('user_context').select('*')
        const ctxMap = Object.fromEntries((ctx || []).map((r: any) => [r.key, r.value]))
        if (!ctxMap['caldav_user'] || !ctxMap['caldav_password']) return 'iCloud Calendar not connected.'
        const events = await fetchICloudEvents(ctxMap['caldav_user'], ctxMap['caldav_password'], input.days_ahead || 7)
        if (!events.length) return 'No upcoming events found.'
        return JSON.stringify(events.map((e: any) => ({ uid: e.uid, title: e.title, start: e.start, end: e.end, location: e.location, allDay: e.allDay, url: e.url, etag: e.etag })))
      }
      case 'create_calendar_event': {
        const { data: ctx } = await supabaseAdmin.from('user_context').select('*')
        const ctxMap = Object.fromEntries((ctx || []).map((r: any) => [r.key, r.value]))
        if (!ctxMap['caldav_user'] || !ctxMap['caldav_password']) return 'iCloud Calendar not connected.'
        const uid = await createICloudEvent(ctxMap['caldav_user'], ctxMap['caldav_password'], { title: input.title, start: input.start, end: input.end, description: input.description, location: input.location, allDay: input.all_day, calendarName: input.calendar_name, calendarUrl: input.calendar_url })
        return `Created "${input.title}"${input.calendar_name ? ` in "${input.calendar_name}"` : ''} — UID: ${uid}`
      }
      case 'update_calendar_event': {
        const { data: ctx } = await supabaseAdmin.from('user_context').select('*')
        const ctxMap = Object.fromEntries((ctx || []).map((r: any) => [r.key, r.value]))
        if (!ctxMap['caldav_user'] || !ctxMap['caldav_password']) return 'iCloud Calendar not connected.'
        await updateICloudEvent(ctxMap['caldav_user'], ctxMap['caldav_password'], input.event_url, input.event_etag, { title: input.new_title, start: input.new_start, end: input.new_end, description: input.new_description, location: input.new_location }, { uid: input.event_uid, title: input.original_title, start: input.original_start, end: input.original_end, allDay: input.original_all_day || false } as any)
        return `Updated "${input.new_title || input.original_title}"`
      }
      case 'delete_calendar_event': {
        const { data: ctx } = await supabaseAdmin.from('user_context').select('*')
        const ctxMap = Object.fromEntries((ctx || []).map((r: any) => [r.key, r.value]))
        if (!ctxMap['caldav_user'] || !ctxMap['caldav_password']) return 'iCloud Calendar not connected.'
        await deleteICloudEvent(ctxMap['caldav_user'], ctxMap['caldav_password'], input.event_url, input.event_etag)
        return `Deleted "${input.title || 'event'}"`
      }
      default:
        return 'Unknown tool'
    }
  } catch (e: any) {
    return `Error: ${e.message}`
  }
}

export async function GET() {
  const { data } = await supabaseAdmin.from('chat_messages').select('*').order('created_at').limit(50)
  return NextResponse.json(data || [])
}

export async function DELETE() {
  await supabaseAdmin.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const { message, system_inject } = await req.json()

  await supabaseAdmin.from('chat_messages').insert({ role: 'user', content: message })

  try {

  const today = format(new Date(), 'yyyy-MM-dd')
  const [briefRes, deadlinesRes, loopsRes, historyRes, contextRes, waitingOnRes, lifeAreasRes, memories, homeCtxRes] = await Promise.all([
    supabaseAdmin.from('briefings').select('*').eq('date', today).single(),
    supabaseAdmin.from('deadlines').select('*').neq('status', 'done').order('due_date').limit(10),
    supabaseAdmin.from('open_loops').select('*').eq('status', 'open').limit(15),
    supabaseAdmin.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('user_context').select('*'),
    supabaseAdmin.from('waiting_on').select('id, title, waiting_for, follow_up_date').eq('status', 'waiting').limit(5),
    supabaseAdmin.from('life_areas').select('area, risk_level, risk_note').neq('risk_level', 'green'),
    loadMemory(),
    supabaseAdmin.from('home_context').select('key, value'),
  ])

  const brief = briefRes.data as any
  const deadlines = deadlinesRes.data || []
  const loops = loopsRes.data || []
  const history = (historyRes.data || []).reverse()
  const contextMap = Object.fromEntries((contextRes.data || []).map((r: any) => [r.key, r.value]))
  const waitingOn = waitingOnRes.data || []
  const redAreas = lifeAreasRes.data || []
  const memoryBlock = formatMemoryForPrompt(memories)
  const homeCtx = Object.fromEntries((homeCtxRes.data || []).map((r: any) => [r.key, r.value]))

  const isMealRequest = /what.*eat|meal|recipe|fridge|cook|food|dinner|lunch|breakfast|shopping list/i.test(message)
  const mealHint = isMealRequest ? '\n\nNote: This looks like a meal question. Use the meal assistant context and give a genuine suggestion.' : ''

  const redAreaAlert = redAreas.length > 0
    ? `\n\n⚠️ LIFE AREAS NEEDING ATTENTION:\n${redAreas.map((a: any) => `${a.area}: ${a.risk_level} — ${a.risk_note}`).join('\n')}`
    : ''

  const systemContext = `${PERSONA_PROMPT}${contextMap['tone_notes'] ? `\n\nTone notes: ${contextMap['tone_notes']}` : ''}${memoryBlock}

---
CURRENT CONTEXT:

Today's Brief: ${brief?.brief_paragraph || 'Not generated yet'}

Today's Priorities:
${(brief?.priorities as any[] || []).slice(0, 3).map((p: any) => `- ${p.task}${p.consequence ? ` (if skipped: ${p.consequence})` : ''}`).join('\n') || 'None'}

Waiting On:
${waitingOn.map((w: any) => `- ${w.title} (from ${w.waiting_for}, follow up ${w.follow_up_date})`).join('\n') || 'Nothing'}

Open Deadlines:
${deadlines.map((d: any) => `- [${d.id}] ${d.title} | due ${d.due_date} | ${d.urgency}`).join('\n') || 'None'}

Open Loops:
${loops.map((l: any) => `- [${l.id}] ${l.title}`).join('\n') || 'None'}

Current focus: ${contextMap['current_focus'] || 'KBS application, UCSD prep, internship search'}
Current time: ${new Date().toLocaleString('en-GB')}
${redAreaAlert}${mealHint}

Home status:
- Laundry: ${homeCtx['laundry_status'] || 'unknown'}
- Trash: ${homeCtx['trash_status'] || 'unknown'}
- Dishes: ${homeCtx['dishes_status'] || 'unknown'}
- Mess level: ${homeCtx['current_mess_level'] || 'unknown'}/5
- Guests: ${homeCtx['upcoming_guests'] || 'none'}
${homeCtx['move_out_mode'] === 'true' ? `- MOVE-OUT MODE: leaving ${homeCtx['move_out_date']} to ${homeCtx['move_out_destination'] || 'destination TBD'}` : ''}

HOME TOOL GUIDANCE: If she mentions doing laundry/dishes/trash/cleaning, silently call update_home_context. If she says "flat is a disaster" or "place is a mess", note it (mess_level 4-5) and offer the home reset flow. Don't mention home status unless relevant or she asks.
${system_inject ? `\n[SYSTEM: ${system_inject}]` : ''}
TOOLS: Use them when she clearly asks or confirms something. Don't call tools speculatively — only when you have real data. Ask before deleting. Don't update life areas from a single message. If she says she finished something, mark it done. If she mentions she's waiting on someone, add it.

PROACTIVE: If a life area has been red for 2+ days, mention it naturally — but only once, not every message.
LANGUAGE: If she writes in Arabic, respond in Arabic.`

  const messages: any[] = [
    ...history.slice(-18).map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ]

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemContext,
    tools: TOOLS,
    messages,
  })

  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter((b: any) => b.type === 'tool_use')
    const toolResults = await Promise.all(
      toolUses.map(async (tu: any) => ({
        type: 'tool_result' as const,
        tool_use_id: tu.id,
        content: await runTool(tu.name, tu.input),
      }))
    )
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemContext,
      tools: TOOLS,
      messages,
    })
  }

  const replyBlock = response.content.find((b: any) => b.type === 'text') as any
  const reply: string = replyBlock?.text || ''

  await supabaseAdmin.from('chat_messages').insert({ role: 'assistant', content: reply })

  return NextResponse.json({ reply })
  } catch (e: any) {
    const isRateLimit = e?.status === 429 || e?.message?.includes('rate_limit') || e?.message?.includes('Rate limit')
    const reply = isRateLimit
      ? "hitting the rate limit right now — try again in a few minutes"
      : "something went wrong on my end, try again"
    return NextResponse.json({ reply })
  }
}
