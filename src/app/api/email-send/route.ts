import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/gmail'
import { anthropic, PERSONA_PROMPT, WIN_DETECTION_PROMPT } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { triageId, to, subject, body, threadId } = await req.json()

  try {
    await sendEmail(session.accessToken as string, to, subject, body, threadId)
    await supabaseAdmin.from('email_triage').update({ status: 'sent' }).eq('id', triageId)

    // Background win detection
    const winContent = `Sent email reply to ${to} with subject: ${subject}\n\nReply: ${body}`
    try {
      const winRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: PERSONA_PROMPT,
        messages: [{ role: 'user', content: WIN_DETECTION_PROMPT(winContent) }],
      })
      const raw = winRes.content[0].type === 'text' ? winRes.content[0].text : '{}'
      const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
      const result = JSON.parse(text)
      if (result.win_found) {
        const win = await supabaseAdmin.from('confidence_entries').insert({
          title: result.title,
          category: result.category || 'admin',
          detail: result.detail,
          source: 'email_send',
          source_ref: triageId,
        }).select().single()
        return NextResponse.json({ success: true, win: win.data })
      }
    } catch { /* win detection is optional */ }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
