'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { urgencyToVariant } from '@/lib/utils'
import { format } from 'date-fns'
import type { EmailTriage } from '@/types'
import { showToast } from '@/components/ui/Toast'
import { fireConfetti } from '@/lib/confetti'

const CLASS_CONFIG: Record<string, { label: string; variant: 'red' | 'orange' | 'yellow' | 'grey' }> = {
  NEEDS_REPLY: { label: 'Reply needed', variant: 'red' },
  NEEDS_ACTION: { label: 'Action needed', variant: 'orange' },
  READ_ONLY: { label: 'Read only', variant: 'yellow' },
  IGNORE: { label: 'Ignore', variant: 'grey' },
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded ${className}`} />
}

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailTriage[]>([])
  const [loading, setLoading] = useState(true)
  const [triaging, setTriaging] = useState(false)
  const [triageStatus, setTriageStatus] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('action')

  useEffect(() => {
    fetch('/api/gmail')
      .then((r) => r.json())
      .then((data) => {
        setEmails(data)
        // Auto-switch to 'all' if nothing actionable
        const hasAction = data.some((e: EmailTriage) =>
          e.classification === 'NEEDS_REPLY' || e.classification === 'NEEDS_ACTION'
        )
        if (!hasAction) setFilter('all')
      })
      .finally(() => setLoading(false))
  }, [])

  async function runTriage() {
    setTriaging(true)
    setTriageStatus('Fetching emails...')
    try {
      const r = await fetch('/api/gmail', { method: 'POST' })
      const { processed } = await r.json()
      setTriageStatus(`Processed ${processed} new emails`)
      const updated = await fetch('/api/gmail').then((r) => r.json())
      setEmails(updated)
      const hasAction = updated.some((e: EmailTriage) =>
        e.classification === 'NEEDS_REPLY' || e.classification === 'NEEDS_ACTION'
      )
      setFilter(hasAction ? 'action' : 'all')
    } catch {
      setTriageStatus('Failed — check Gmail connection in Settings')
    } finally {
      setTriaging(false)
      setTimeout(() => setTriageStatus(''), 4000)
    }
  }

  async function handleSend(email: EmailTriage) {
    const to = email.sender
    const subject = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`
    const body = drafts[email.id] ?? email.draft_reply ?? ''
    if (!confirm(`Send reply to ${to}?`)) return
    setSending(email.id)
    try {
      const r = await fetch('/api/email-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triageId: email.id, to, subject, body, threadId: email.gmail_thread_id }),
      })
      if (r.ok) {
        setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, status: 'sent' } : e))
        const data = await r.json()
        if (data.win) {
          await fireConfetti()
          showToast({ label: '[Win detected]', message: `Added to your evidence folder — ${data.win.title}` })
        }
      }
    } finally {
      setSending(null)
    }
  }

  async function handleMark(id: string, status: 'handled' | 'ignored') {
    await fetch('/api/email-handle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setEmails((prev) => prev.filter((e) => e.id !== id))
  }

  const actionEmails = emails.filter((e) =>
    e.classification === 'NEEDS_REPLY' || e.classification === 'NEEDS_ACTION'
  )
  const readEmails = emails.filter((e) => e.classification === 'READ_ONLY')
  const ignoreEmails = emails.filter((e) => e.classification === 'IGNORE')

  const filtered = filter === 'action'
    ? actionEmails
    : filter === 'read'
    ? readEmails
    : filter === 'ignore'
    ? ignoreEmails
    : emails

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Inbox</h1>
          {triageStatus && (
            <p className="text-xs text-zinc-400 mt-0.5">{triageStatus}</p>
          )}
        </div>
        <button
          onClick={runTriage}
          disabled={triaging}
          className="text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {triaging ? 'Triaging...' : '↻ Run triage'}
        </button>
      </div>

      {/* Summary bar */}
      {!loading && emails.length > 0 && (
        <div className="flex gap-3 text-xs text-zinc-500">
          {actionEmails.length > 0 && (
            <span className="text-red-500 font-medium">{actionEmails.length} need action</span>
          )}
          {readEmails.length > 0 && <span>{readEmails.length} to read</span>}
          {ignoreEmails.length > 0 && <span>{ignoreEmails.length} noise</span>}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 text-xs overflow-x-auto pb-1">
        {[
          { key: 'action', label: `Action (${actionEmails.length})` },
          { key: 'read', label: `Read (${readEmails.length})` },
          { key: 'all', label: `All (${emails.length})` },
          { key: 'ignore', label: `Noise (${ignoreEmails.length})` },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors shrink-0 ${
              filter === f.key
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Email list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          {emails.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">No emails triaged yet.</p>
              <p className="text-xs text-zinc-400">Hit "Run triage" to pull your inbox.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-zinc-500">Nothing here.</p>
              {filter === 'action' && (
                <p className="text-xs text-zinc-400">No emails need a reply or action right now.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((email) => {
            const isExpanded = expanded === email.id
            const cls = CLASS_CONFIG[email.classification]
            const receivedAt = email.received_at
              ? format(new Date(email.received_at), 'EEE d MMM, HH:mm')
              : ''

            return (
              <div
                key={email.id}
                className={`rounded-lg border overflow-hidden transition-colors ${
                  email.classification === 'NEEDS_REPLY' || email.classification === 'NEEDS_ACTION'
                    ? 'border-zinc-200 dark:border-zinc-700'
                    : 'border-zinc-100 dark:border-zinc-800 opacity-70'
                }`}
              >
                {/* Card header */}
                <button
                  className="w-full text-left p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : email.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={cls.variant}>{cls.label}</Badge>
                      {email.urgency && email.urgency !== 'grey' && (
                        <Badge variant={urgencyToVariant(email.urgency)}>{email.urgency}</Badge>
                      )}
                      {email.hidden_deadline && (
                        <Badge variant="red">⚑ {email.hidden_deadline}</Badge>
                      )}
                      {email.status === 'sent' && <Badge variant="green">Sent ✓</Badge>}
                      {email.status === 'handled' && <Badge variant="grey">Handled</Badge>}
                    </div>
                    <span className="text-xs text-zinc-400 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  <p className="text-sm font-medium leading-snug">{email.subject}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">{email.sender}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{email.summary}</p>
                  {receivedAt && (
                    <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">{receivedAt}</p>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 space-y-4 bg-zinc-50 dark:bg-zinc-900/50">
                    {email.friction_note && (
                      <p className="text-xs text-zinc-400 italic border-l-2 border-zinc-200 dark:border-zinc-700 pl-3">
                        {email.friction_note}
                      </p>
                    )}

                    {email.hidden_deadline_note && (
                      <div className="rounded bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-3 text-xs text-red-600 dark:text-red-400">
                        ⚑ {email.hidden_deadline_note}
                      </div>
                    )}

                    {(email.classification === 'NEEDS_REPLY' || email.classification === 'NEEDS_ACTION') && email.draft_reply && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Draft reply</p>
                        <textarea
                          className="w-full text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400 leading-relaxed"
                          rows={7}
                          value={drafts[email.id] ?? email.draft_reply}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [email.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSend(email)}
                            disabled={sending === email.id || email.status === 'sent'}
                            className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm py-2.5 rounded-lg font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
                          >
                            {sending === email.id
                              ? 'Sending...'
                              : email.status === 'sent'
                              ? 'Sent ✓'
                              : '↑ Send reply'}
                          </button>
                          <button
                            onClick={() => handleMark(email.id, 'handled')}
                            className="px-4 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            Mark handled
                          </button>
                        </div>
                      </div>
                    )}

                    {email.classification === 'NEEDS_ACTION' && !email.draft_reply && (
                      <button
                        onClick={() => handleMark(email.id, 'handled')}
                        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      >
                        Mark handled →
                      </button>
                    )}

                    {email.classification === 'READ_ONLY' && (
                      <button
                        onClick={() => handleMark(email.id, 'handled')}
                        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      >
                        Mark as read →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
