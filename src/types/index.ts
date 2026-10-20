export type Bucket = 'body' | 'admin' | 'growth' | 'joy'
export type Urgency = 'red' | 'orange' | 'yellow' | 'grey'
export type TaskStatus = 'MUST_TODAY' | 'SOON' | 'CAN_WAIT' | 'FAKE_URGENT'
export type EmailClassification = 'NEEDS_REPLY' | 'NEEDS_ACTION' | 'READ_ONLY' | 'IGNORE'

export interface Priority {
  task: string
  bucket: Bucket
  why_today: string
  friction_note: string
  estimated_minutes: number
  status: TaskStatus
  draft_ready: boolean
  first_step: string
  friction?: string
  friction_removal?: string
}

export interface DayBlock {
  time: string
  block: string
  bucket: Bucket
}

export interface Briefing {
  id: string
  date: string
  generated_at: string
  brief_paragraph: string
  priorities: Priority[]
  day_plan: DayBlock[]
  open_loops_count: number
  open_loops_this_week: number
  identity_action: string
  warnings: string[]
  moved_to_later: string[]
}

export interface EmailTriage {
  id: string
  gmail_thread_id: string
  gmail_message_id: string
  sender: string
  subject: string
  received_at: string
  summary: string
  classification: EmailClassification
  hidden_deadline: string | null
  hidden_deadline_note: string | null
  friction_note: string
  draft_reply: string | null
  urgency: Urgency
  status: 'pending' | 'sent' | 'handled' | 'ignored'
}

export interface Deadline {
  id: string
  title: string
  due_date: string
  due_timezone: string
  due_saudi_time: string | null
  category: 'uni' | 'career' | 'admin' | 'travel' | 'personal'
  urgency: Urgency
  source: 'email' | 'manual'
  source_email_id: string | null
  first_step: string | null
  estimated_minutes: number | null
  consequence: string | null
  status: 'pending' | 'in_progress' | 'done'
}

export interface OpenLoop {
  id: string
  title: string
  bucket: Bucket | null
  source: 'email' | 'manual' | 'chat'
  urgency: Urgency
  relevant_this_week: boolean
  snoozed_until: string | null
  status: 'open' | 'done' | 'irrelevant'
  first_step: string | null
  notes: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
