import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { anthropic, PERSONA_PROMPT, EMAIL_TRIAGE_PROMPT } from '@/lib/claude'
import { fetchRecentThreads, getThreadBody } from '@/lib/gmail'

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('email_triage')
      .select('*')
      .neq('status', 'ignored')
      .order('received_at', { ascending: false })
    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (session?.error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'Gmail connection expired. Reconnect in Settings.', expired: true }, { status: 401 })
    }
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated with Gmail', expired: false }, { status: 401 })
    }

    const { data: ctxRows } = await supabaseAdmin.from('user_context').select('*')
    const ctx = Object.fromEntries((ctxRows || []).map((r: any) => [r.key, r.value]))
    const emailCategories = ctx['email_categories'] || ''

    const threads = await fetchRecentThreads(session.accessToken as string, 10)

    const results = await Promise.allSettled(
      threads.map(async (t) => {
        const { data: existing } = await supabaseAdmin
          .from('email_triage')
          .select('id')
          .eq('gmail_thread_id', t.threadId)
          .single()

        if (existing) return null

        const body = await getThreadBody(session.accessToken as string, t.threadId)
        const flags = [t.isStarred ? '[STARRED BY USER]' : '', t.isImportant ? '[MARKED IMPORTANT]' : ''].filter(Boolean).join(' ')
        const threadText = `From: ${t.sender}\nSubject: ${t.subject}\n${flags ? `Flags: ${flags}\n` : ''}\n${body}`

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: PERSONA_PROMPT,
          messages: [{ role: 'user', content: EMAIL_TRIAGE_PROMPT(threadText, emailCategories) }],
        })

        const raw = (response.content[0] as any).text || '{}'
        const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
        const triage = JSON.parse(text)

        await supabaseAdmin.from('email_triage').insert({
          gmail_thread_id: t.threadId,
          gmail_message_id: t.messageId,
          sender: t.sender,
          subject: t.subject,
          received_at: new Date(t.date).toISOString(),
          summary: triage.summary,
          classification: triage.classification,
          hidden_deadline: triage.hidden_deadline,
          hidden_deadline_note: triage.hidden_deadline_note,
          friction_note: triage.friction_note,
          draft_reply: triage.draft_reply,
          urgency: triage.urgency?.toLowerCase() || 'grey',
        })

        if (triage.hidden_deadline) {
          await supabaseAdmin.from('deadlines').insert({
            title: `[Email] ${t.subject}`,
            due_date: triage.hidden_deadline,
            category: 'admin',
            urgency: triage.urgency?.toLowerCase() || 'yellow',
            source: 'email',
            source_email_id: t.threadId,
            consequence: triage.hidden_deadline_note,
          })
        }

        // Auto-create trip if travel detected
        if (triage.travel_detected && triage.travel_data) {
          const td = triage.travel_data
          // Check if trip already exists for this date/destination
          const { data: existingTrip } = await supabaseAdmin
            .from('trips')
            .select('id')
            .eq('destination', td.destination)
            .eq('departure_date', td.departure_date)
            .single()

          if (!existingTrip) {
            await supabaseAdmin.from('trips').insert({
              title: `${td.origin} → ${td.destination} · ${td.departure_date}`,
              origin: td.origin,
              destination: td.destination,
              departure_date: td.departure_date,
              return_date: td.return_date,
              flight_number: td.flight_number,
              airline: td.airline,
              departure_time: td.departure_time,
              arrival_time: td.arrival_time,
              hotel_name: td.hotel_name,
              checkin_date: td.checkin_date,
              checkout_date: td.checkout_date,
              booking_reference: td.booking_reference,
              trip_purpose: td.trip_purpose,
              source_email_id: t.threadId,
              status: 'upcoming',
            })
          }
        }

        // Auto-create waiting_on if detected
        if (triage.waiting_on_detected && triage.waiting_on_title) {
          const sentDate = new Date(t.date)
          const followUp = new Date(sentDate)
          followUp.setDate(followUp.getDate() + 4)
          await supabaseAdmin.from('waiting_on').insert({
            title: triage.waiting_on_title,
            waiting_for: triage.waiting_on_for || t.sender,
            context: `Re: ${t.subject}`,
            sent_date: sentDate.toISOString().split('T')[0],
            follow_up_date: followUp.toISOString().split('T')[0],
            source: 'email',
            source_ref: t.threadId,
          })
        }

        return triage
      })
    )

    const processed = results.filter((r) => r.status === 'fulfilled' && r.value).length
    return NextResponse.json({ processed })
  } catch (error) {
    console.error('Gmail triage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
