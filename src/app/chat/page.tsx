'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'

// Brain dump modal
function BrainDumpModal({ onClose, onSend }: { onClose: () => void; onSend: (msg: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'text' | 'voice'>('choose')
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [expanded, setExpanded] = useState(false)
  const recognitionRef = useRef<any>(null)

  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Voice input is not supported in this browser. Try Chrome or Safari.')
      setMode('text')
      return
    }
    const r = new SR()
    r.continuous = true
    r.interimResults = false
    r.lang = 'en-US'
    r.onresult = (e: any) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) t += e.results[i][0].transcript + ' '
      }
      if (t) setInput((prev) => (prev + ' ' + t).trim())
    }
    r.onerror = (e: any) => {
      console.error('Speech error', e.error)
      setListening(false)
    }
    r.onend = () => setListening(false)
    try {
      r.start()
      recognitionRef.current = r
      setListening(true)
      setMode('voice')
    } catch (e) {
      console.error('Could not start recognition', e)
      setMode('text')
    }
  }

  function stopVoice() {
    try { recognitionRef.current?.stop() } catch {}
    setListening(false)
  }

  async function submit() {
    if (!input.trim()) return
    setLoading(true)
    recognitionRef.current?.stop()
    try {
      const r = await fetch('/api/brain-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, input_type: mode === 'voice' ? 'voice' : 'text' }),
      })
      setResult(await r.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-2xl md:rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">🧠 Brain dump</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg">×</button>
        </div>

        {!result ? (
          <>
            {mode === 'choose' && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMode('text')} className="py-6 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  ✍️ Type it
                </button>
                <button onClick={startVoice} className="py-6 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  🎙 Say it
                </button>
              </div>
            )}
            {(mode === 'text' || mode === 'voice') && (
              <div className="space-y-3">
                {mode === 'voice' && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className={`w-2 h-2 rounded-full ${listening ? 'bg-red-500 animate-pulse' : 'bg-zinc-300'}`} />
                    {listening ? 'Listening...' : 'Tap below to submit or edit'}
                  </div>
                )}
                <textarea
                  autoFocus={mode === 'text'}
                  className="w-full text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400 min-h-[120px] leading-relaxed"
                  placeholder={mode === 'voice' ? 'Transcript will appear here as you speak...' : "Everything on your mind — deadlines, worries, things to do. Don't filter it."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <div className="flex gap-2">
                  {mode === 'voice' && listening && (
                    <button onClick={stopVoice} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm">Stop</button>
                  )}
                  <button onClick={submit} disabled={loading || !input.trim()} className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 py-2.5 rounded-xl text-sm font-medium hover:opacity-80 disabled:opacity-40 transition-opacity">
                    {loading ? 'Sorting...' : 'Sort it'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4 space-y-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Sorted</p>
              <div className="space-y-1 text-sm">
                {result.counts?.deadlines > 0 && <p>✓ {result.counts.deadlines} deadline{result.counts.deadlines !== 1 ? 's' : ''} added</p>}
                {result.counts?.open_loops > 0 && <p>✓ {result.counts.open_loops} open loop{result.counts.open_loops !== 1 ? 's' : ''} added</p>}
                {result.counts?.waiting_on > 0 && <p>✓ {result.counts.waiting_on} waiting-on created</p>}
                {result.counts?.fake_urgency > 0 && <p className="text-zinc-400">✓ {result.counts.fake_urgency} thing{result.counts.fake_urgency !== 1 ? 's' : ''} — fake urgency, not added</p>}
              </div>
            </div>
            {result.summary && <p className="text-sm text-zinc-500">{result.summary}</p>}
            {result.items?.length > 0 && (
              <div>
                <button onClick={() => setExpanded(!expanded)} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
                  {expanded ? 'Hide' : 'See breakdown →'}
                </button>
                {expanded && (
                  <div className="mt-2 space-y-1.5">
                    {result.items.map((item: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.category === 'deadline' ? 'bg-red-400' : item.category === 'open_loop' ? 'bg-yellow-400' : item.category === 'waiting_on' ? 'bg-blue-400' : 'bg-zinc-200'}`} />
                        <span className={item.category === 'fake_urgency' ? 'text-zinc-400 line-through' : ''}>{item.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={onClose} className="w-full py-2.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors">Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

// Should I bother modal
function ShouldIBotherModal({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function submit() {
    if (!input.trim()) return
    setLoading(true)
    try {
      const r = await fetch('/api/should-i-bother', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      setResult(await r.json())
    } finally {
      setLoading(false)
    }
  }

  const VERDICT_CONFIG = {
    FAKE_URGENCY: { label: 'FAKE URGENCY', color: 'text-zinc-500 dark:text-zinc-400', bg: 'bg-zinc-50 dark:bg-zinc-800/50', border: 'border-zinc-200 dark:border-zinc-700' },
    YES_DO_THIS: { label: 'YES — DO THIS', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-800' },
    DECIDE_FIRST: { label: 'DECIDE FIRST', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800' },
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-2xl md:rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">❓ Should I bother?</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg">×</button>
        </div>
        {!result ? (
          <div className="space-y-3">
            <textarea
              autoFocus
              className="w-full text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400 min-h-[80px] leading-relaxed"
              placeholder="What are you considering?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            />
            <button onClick={submit} disabled={loading || !input.trim()} className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 py-2.5 rounded-xl text-sm font-medium hover:opacity-80 disabled:opacity-40 transition-opacity">
              {loading ? 'Thinking...' : 'Get verdict'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const cfg = VERDICT_CONFIG[result.verdict as keyof typeof VERDICT_CONFIG] || VERDICT_CONFIG.FAKE_URGENCY
              return (
                <div className={`rounded-xl border ${cfg.bg} ${cfg.border} p-4 space-y-2`}>
                  <p className={`text-xs font-bold tracking-widest ${cfg.color}`}>[{cfg.label}]</p>
                  <p className="text-sm leading-relaxed">{result.response}</p>
                  {result.action && <p className="text-xs text-zinc-500 pt-1">→ {result.action}</p>}
                </div>
              )
            })()}
            <div className="flex gap-2">
              <button onClick={() => { setResult(null); setInput('') }} className="flex-1 py-2 text-sm text-zinc-500 border border-zinc-200 dark:border-zinc-700 rounded-xl">Ask another</button>
              <button onClick={onClose} className="flex-1 py-2 text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:opacity-80 transition-opacity">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// What now inline card
function WhatNowCard({ onDismiss }: { onDismiss: () => void }) {
  const [state, setState] = useState<'loading' | 'energy' | 'result'>('loading')
  const [result, setResult] = useState<any>(null)

  async function fetchWhatNow(energy?: string) {
    setState('loading')
    try {
      const r = await fetch('/api/what-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optional_energy: energy }),
      })
      const data = await r.json()
      if (data.needs_input) { setState('energy'); return }
      setResult(data)
      setState('result')
    } catch { onDismiss() }
  }

  useEffect(() => { fetchWhatNow() }, [])

  if (state === 'loading') return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2 mx-3 mb-2">
      <div className="h-4 w-24 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
      <div className="h-4 w-full animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
    </div>
  )

  if (state === 'energy') return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3 mx-3 mb-2">
      <p className="text-xs text-zinc-400">How are you feeling right now?</p>
      <div className="flex gap-2">
        {[['low', 'Low'], ['okay', 'Okay'], ['good', 'Good']].map(([v, l]) => (
          <button key={v} onClick={() => fetchWhatNow(v)} className="flex-1 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">{l}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-4 mx-3 mb-2 space-y-3">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">⚡ Right now</p>
      <p className="text-sm leading-relaxed">{result?.response}</p>
      <div className="flex gap-2">
        <button onClick={onDismiss} className="flex-1 py-2 text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-80 transition-opacity">On it</button>
        <button onClick={onDismiss} className="flex-1 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Not now</button>
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  "What do I actually need to do today?",
  "What's due this week?",
  "I just woke up late, re-plan my day",
  "Draft a reply to an email",
  "What's the first step I should take right now?",
]

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [modal, setModal] = useState<'brain-dump' | 'should-i-bother' | null>(null)
  const [showWhatNow, setShowWhatNow] = useState(false)
  const [clearing, setClearing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/chat').then((r) => r.json()).then(setMessages).finally(() => setLoading(false))
  }, [])

  async function clearHistory() {
    if (!confirm('Clear all chat history?')) return
    setClearing(true)
    await fetch('/api/chat', { method: 'DELETE' })
    setMessages([])
    setClearing(false)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showWhatNow])

  async function send(text?: string) {
    const msg = text || input.trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', content: msg, created_at: new Date().toISOString() }])
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    })
    const { reply } = await r.json()
    setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: reply, created_at: new Date().toISOString() }])
    setSending(false)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-3rem)]">
      {modal === 'brain-dump' && <BrainDumpModal onClose={() => setModal(null)} onSend={send} />}
      {modal === 'should-i-bother' && <ShouldIBotherModal onClose={() => setModal(null)} />}

      {/* Header */}
      {messages.length > 0 && !loading && (
        <div className="flex justify-end mb-1 shrink-0">
          <button
            onClick={clearHistory}
            disabled={clearing}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-40"
          >
            {clearing ? 'Clearing...' : 'Clear history'}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {loading ? (
          <div className="space-y-3 pt-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className="h-12 w-48 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="pt-8 space-y-3">
            <p className="text-sm text-zinc-400 text-center">Ask me anything.</p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="w-full text-left text-sm text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-1.5 w-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        {showWhatNow && <WhatNowCard onDismiss={() => setShowWhatNow(false)} />}
        <div ref={bottomRef} />
      </div>

      {/* Action buttons + input */}
      <div className="mt-3 shrink-0 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => setModal('brain-dump')}
            className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            🧠 Brain dump
          </button>
          <button
            onClick={() => setModal('should-i-bother')}
            className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            ❓ Should I bother?
          </button>
          <button
            onClick={() => setShowWhatNow(!showWhatNow)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            ⚡ What now?
          </button>
        </div>

        <div className="flex gap-2 items-end border border-zinc-200 dark:border-zinc-700 rounded-xl p-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm focus:outline-none max-h-32 py-1 px-1"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = t.scrollHeight + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg w-8 h-8 flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-30 shrink-0"
          >
            ↑
          </button>
        </div>
        <p className="text-xs text-zinc-400 px-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
