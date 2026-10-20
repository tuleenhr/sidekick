import { supabaseAdmin } from './supabase'
import { anthropic, PERSONA_PROMPT } from './claude'

export interface MemoryEntry {
  id: string
  pattern_type: string
  observation: string
  evidence: string | null
  confidence: number
  last_seen: string
  active: boolean
}

export async function loadMemory(): Promise<MemoryEntry[]> {
  const { data } = await supabaseAdmin
    .from('secretary_memory')
    .select('*')
    .eq('active', true)
    .order('confidence', { ascending: false })
    .limit(30)
  return data || []
}

export function formatMemoryForPrompt(memories: MemoryEntry[]): string {
  if (!memories.length) return ''

  const grouped: Record<string, MemoryEntry[]> = {}
  for (const m of memories) {
    if (!grouped[m.pattern_type]) grouped[m.pattern_type] = []
    grouped[m.pattern_type].push(m)
  }

  const sections: string[] = []

  const labels: Record<string, string> = {
    avoidance: 'Tasks she tends to avoid',
    timing: 'When she actually gets things done',
    friction: 'Known friction points',
    preference: 'Her preferences',
    decision: 'Past decisions and commitments',
    observation: 'Observed patterns',
  }

  for (const [type, items] of Object.entries(grouped)) {
    const label = labels[type] || type
    sections.push(`${label}:\n${items.map(m => `- ${m.observation}${m.confidence > 2 ? ` (seen ${m.confidence}x)` : ''}`).join('\n')}`)
  }

  return `\n\nLEARNED PATTERNS (from observing Tuleen over time — use these to make better decisions):\n${sections.join('\n\n')}`
}

export async function extractAndSavePatterns(
  chatHistory: { role: string; content: string }[],
  briefHistory: any[]
): Promise<void> {
  if (chatHistory.length < 4) return // not enough data yet

  const recentChat = chatHistory.slice(-30)
  const recentBriefs = briefHistory.slice(-7)

  const prompt = `You are analyzing conversation and brief history to extract behavioral patterns about Tuleen.

RECENT CHAT HISTORY:
${recentChat.map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}`).join('\n')}

RECENT BRIEF HISTORY (moved_to_later and priorities):
${recentBriefs.map(b => `Date: ${b.date}\nMoved to later: ${JSON.stringify(b.moved_to_later || [])}\nPriorities: ${(b.priorities || []).map((p: any) => p.task).join(', ')}`).join('\n\n')}

Extract behavioral patterns. Look for:
- Tasks she keeps moving, avoiding, or procrastinating on
- What times of day she mentions being productive or getting things done
- Friction points — what makes tasks feel hard or unclear
- Commitments she made ("I'll do X") — did she follow through?
- Preferences she's expressed about how she likes to work
- Recurring topics or concerns

Return a JSON array of patterns (max 8, only include high-confidence ones):
[
  {
    "pattern_type": "avoidance|timing|friction|preference|decision|observation",
    "observation": "one clear sentence describing the pattern",
    "evidence": "brief quote or example from the data that shows this pattern"
  }
]

Only include patterns you're confident about from the data. Return ONLY the JSON array.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: PERSONA_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  let patterns: { pattern_type: string; observation: string; evidence: string }[]
  try {
    patterns = JSON.parse(text)
  } catch {
    return
  }

  // Load existing memories to merge/increment confidence
  const { data: existing } = await supabaseAdmin
    .from('secretary_memory')
    .select('*')
    .eq('active', true)

  for (const pattern of patterns) {
    // Check if a very similar observation already exists
    const similar = existing?.find(
      (e) =>
        e.pattern_type === pattern.pattern_type &&
        stringSimilarity(e.observation, pattern.observation) > 0.7
    )

    if (similar) {
      // Increment confidence and update evidence
      await supabaseAdmin
        .from('secretary_memory')
        .update({
          confidence: similar.confidence + 1,
          last_seen: new Date().toISOString(),
          evidence: pattern.evidence || similar.evidence,
        })
        .eq('id', similar.id)
    } else {
      // Insert new pattern
      await supabaseAdmin.from('secretary_memory').insert({
        pattern_type: pattern.pattern_type,
        observation: pattern.observation,
        evidence: pattern.evidence,
        confidence: 1,
      })
    }
  }
}

// Simple word-overlap similarity
function stringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/))
  const wordsB = new Set(b.toLowerCase().split(/\s+/))
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return intersection / union
}
