import { google } from 'googleapis'

export function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: 'v1', auth })
}

export interface ThreadSummary {
  threadId: string
  messageId: string
  sender: string
  subject: string
  date: string
  snippet: string
  messageCount: number
  isStarred: boolean
  isImportant: boolean
}

async function getThreadDetails(
  gmail: ReturnType<typeof google.gmail>,
  threadId: string
): Promise<ThreadSummary | null> {
  try {
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    })
    const messages = thread.data.messages || []
    if (!messages.length) return null

    const first = messages[0]
    const last = messages[messages.length - 1]
    const getHeader = (msg: typeof first, name: string) =>
      msg?.payload?.headers?.find((h) => h.name === name)?.value || ''

    const labels = last?.labelIds || []

    return {
      threadId,
      messageId: last?.id || '',
      sender: getHeader(first, 'From'),
      subject: getHeader(first, 'Subject'),
      date: getHeader(last, 'Date'),
      snippet: last?.snippet || '',
      messageCount: messages.length,
      isStarred: labels.includes('STARRED'),
      isImportant: labels.includes('IMPORTANT'),
    }
  } catch {
    return null
  }
}

export async function fetchRecentThreads(
  accessToken: string,
  maxResults = 30
): Promise<ThreadSummary[]> {
  const gmail = getGmailClient(accessToken)
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)

  // Run 3 queries in parallel: recent inbox, starred, and important
  const [recentRes, starredRes, importantRes] = await Promise.all([
    gmail.users.threads.list({
      userId: 'me',
      maxResults,
      q: `after:${sevenDaysAgo} in:inbox -category:promotions -category:social`,
    }),
    gmail.users.threads.list({
      userId: 'me',
      maxResults: 20,
      q: 'is:starred in:inbox',
    }),
    gmail.users.threads.list({
      userId: 'me',
      maxResults: 20,
      q: 'is:important is:unread in:inbox',
    }),
  ])

  // Merge and deduplicate by threadId
  const seen = new Set<string>()
  const allThreadIds: string[] = []

  for (const res of [recentRes, starredRes, importantRes]) {
    for (const t of res.data.threads || []) {
      if (t.id && !seen.has(t.id)) {
        seen.add(t.id)
        allThreadIds.push(t.id)
      }
    }
  }

  const details = await Promise.all(
    allThreadIds.map((id) => getThreadDetails(gmail, id))
  )

  return details
    .filter((t): t is ThreadSummary => t !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function getThreadBody(accessToken: string, threadId: string): Promise<string> {
  const gmail = getGmailClient(accessToken)
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  })

  const messages = thread.data.messages || []
  const parts: string[] = []

  for (const msg of messages) {
    const from = msg.payload?.headers?.find((h) => h.name === 'From')?.value || ''
    const date = msg.payload?.headers?.find((h) => h.name === 'Date')?.value || ''
    const body = extractBody(msg.payload)
    parts.push(`--- Message from ${from} on ${date} ---\n${body.slice(0, 800)}`)
  }

  return parts.join('\n\n')
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ''
}

export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string
) {
  const gmail = getGmailClient(accessToken)

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ]
  const raw = Buffer.from(messageParts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId },
  })
}
