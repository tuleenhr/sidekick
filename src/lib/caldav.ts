import { DAVClient, DAVCalendar } from 'tsdav'
import { addDays, startOfDay, endOfDay } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

export interface CalendarEvent {
  uid: string
  title: string
  start: string
  end: string
  location?: string
  description?: string
  allDay: boolean
  calendarUrl?: string
  etag?: string
  url?: string
}

function makeClient(appleId: string, appPassword: string) {
  return new DAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username: appleId, password: appPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
}

export async function fetchICloudEvents(
  appleId: string,
  appPassword: string,
  daysAhead = 3
): Promise<CalendarEvent[]> {
  const client = makeClient(appleId, appPassword)
  await client.login()
  const calendars = await client.fetchCalendars()

  const now = new Date()
  const start = startOfDay(now)
  const end = endOfDay(addDays(now, daysAhead))
  const events: CalendarEvent[] = []

  for (const cal of calendars) {
    try {
      const calEvents = await client.fetchCalendarObjects({
        calendar: cal,
        timeRange: { start: start.toISOString(), end: end.toISOString() },
      })
      for (const obj of calEvents) {
        if (!obj.data) continue
        const parsed = parseICS(obj.data)
        if (parsed) {
          events.push({
            ...parsed,
            calendarUrl: cal.url,
            etag: obj.etag,
            url: obj.url,
          })
        }
      }
    } catch {
      // skip calendars that fail
    }
  }

  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

export async function listICloudCalendars(
  appleId: string,
  appPassword: string
): Promise<{ name: string; url: string; color?: string }[]> {
  const client = makeClient(appleId, appPassword)
  await client.login()
  const calendars = await client.fetchCalendars()
  return calendars.map((c) => ({
    name: (c as any).displayName || c.url.split('/').filter(Boolean).pop() || 'Calendar',
    url: c.url,
    color: (c as any).calendarColor,
  }))
}

export async function createICloudEvent(
  appleId: string,
  appPassword: string,
  event: {
    title: string
    start: string
    end: string
    description?: string
    location?: string
    allDay?: boolean
    calendarUrl?: string  // if provided, create in this calendar
    calendarName?: string // if provided, find by name
  }
): Promise<string> {
  const client = makeClient(appleId, appPassword)
  await client.login()
  const calendars = await client.fetchCalendars()

  let cal: DAVCalendar | undefined

  if (event.calendarUrl) {
    cal = calendars.find((c) => c.url === event.calendarUrl)
  } else if (event.calendarName) {
    const nameLower = event.calendarName.toLowerCase()
    cal = calendars.find((c) =>
      ((c as any).displayName || '').toLowerCase().includes(nameLower)
    )
  }

  // Fall back to first non-Google calendar
  if (!cal) cal = calendars.find((c) => !c.url.includes('calendar.google')) || calendars[0]
  if (!cal) throw new Error('No calendar found')

  const uid = uuidv4()
  const now = formatICSDate(new Date(), false)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dtstart = event.allDay
    ? formatICSDateOnly(new Date(event.start))
    : formatICSDateLocal(new Date(event.start))
  const dtend = event.allDay
    ? formatICSDateOnly(new Date(new Date(event.end).getTime() + 24 * 60 * 60 * 1000))
    : formatICSDateLocal(new Date(event.end))

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Secretary//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    event.allDay ? `DTSTART;VALUE=DATE:${dtstart}` : `DTSTART;TZID=${tz}:${dtstart}`,
    event.allDay ? `DTEND;VALUE=DATE:${dtend}` : `DTEND;TZID=${tz}:${dtend}`,
    `SUMMARY:${escapeICS(event.title)}`,
    event.description ? `DESCRIPTION:${escapeICS(event.description)}` : '',
    event.location ? `LOCATION:${escapeICS(event.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')

  await client.createCalendarObject({
    calendar: cal,
    filename: `${uid}.ics`,
    iCalString: ics,
  })

  return uid
}

export async function updateICloudEvent(
  appleId: string,
  appPassword: string,
  eventUrl: string,
  etag: string,
  updates: {
    title?: string
    start?: string
    end?: string
    description?: string
    location?: string
  },
  original: CalendarEvent
): Promise<void> {
  const client = makeClient(appleId, appPassword)
  await client.login()

  const title = updates.title || original.title
  const start = updates.start || original.start
  const end = updates.end || original.end
  const allDay = original.allDay

  const now = formatICSDate(new Date(), false)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dtstart = allDay ? formatICSDateOnly(new Date(start)) : formatICSDateLocal(new Date(start))
  const dtend = allDay ? formatICSDateOnly(new Date(end)) : formatICSDateLocal(new Date(end))

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Secretary//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${original.uid}`,
    `DTSTAMP:${now}`,
    allDay ? `DTSTART;VALUE=DATE:${dtstart}` : `DTSTART;TZID=${tz}:${dtstart}`,
    allDay ? `DTEND;VALUE=DATE:${dtend}` : `DTEND;TZID=${tz}:${dtend}`,
    `SUMMARY:${escapeICS(title)}`,
    updates.description ? `DESCRIPTION:${escapeICS(updates.description)}` : '',
    updates.location ? `LOCATION:${escapeICS(updates.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')

  await client.updateCalendarObject({
    calendarObject: { url: eventUrl, etag, data: ics },
  })
}

export async function deleteICloudEvent(
  appleId: string,
  appPassword: string,
  eventUrl: string,
  etag: string
): Promise<void> {
  const client = makeClient(appleId, appPassword)
  await client.login()
  await client.deleteCalendarObject({
    calendarObject: { url: eventUrl, etag },
  })
}

// --- ICS helpers ---

function formatICSDate(d: Date, local: boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (local) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Format as local floating time for use with TZID (no Z suffix)
function formatICSDateLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function formatICSDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function escapeICS(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function parseICS(ics: string): CalendarEvent | null {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)

  let inEvent = false
  // Store both the full key and base key, plus track TZID per property
  const props: Record<string, string> = {}
  const tzids: Record<string, string> = {}

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; continue }
    if (line === 'END:VEVENT') { inEvent = false; continue }
    if (!inEvent) continue

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx)
    const value = line.slice(colonIdx + 1)
    const baseKey = key.split(';')[0]

    // Extract TZID param if present (e.g. DTSTART;TZID=Asia/Riyadh)
    const tzidMatch = key.match(/TZID=([^;:]+)/)
    if (tzidMatch) tzids[baseKey] = tzidMatch[1]

    props[baseKey] = value
  }

  if (!props['SUMMARY']) return null
  const dtstart = props['DTSTART'] || ''
  if (!dtstart) return null
  const dtend = props['DTEND'] || dtstart
  const allDay = dtstart.length === 8 && !dtstart.includes('T')

  return {
    uid: props['UID'] || uuidv4(),
    title: unescapeICS(props['SUMMARY'] || ''),
    start: parseICSDate(dtstart, allDay, tzids['DTSTART']),
    end: parseICSDate(dtend, allDay, tzids['DTEND'] || tzids['DTSTART']),
    location: props['LOCATION'] ? unescapeICS(props['LOCATION']) : undefined,
    description: props['DESCRIPTION'] ? unescapeICS(props['DESCRIPTION']) : undefined,
    allDay,
  }
}

function unescapeICS(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function parseICSDate(icsDate: string, allDay = false, tzid?: string): string {
  if (!icsDate) return new Date().toISOString()
  const clean = icsDate.trim()

  if (allDay || (clean.length === 8 && !clean.includes('T'))) {
    const y = clean.slice(0, 4), m = clean.slice(4, 6), d = clean.slice(6, 8)
    return `${y}-${m}-${d}`
  }

  const match = clean.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)/)
  if (!match) return new Date().toISOString()
  const [, y, mo, d, h, min, s, utc] = match

  if (utc === 'Z') {
    // UTC — convert directly
    return new Date(`${y}-${mo}-${d}T${h}:${min}:${s}Z`).toISOString()
  }

  if (tzid) {
    // Floating time with TZID — use Intl to get the correct UTC offset
    try {
      const localStr = `${y}-${mo}-${d}T${h}:${min}:${s}`
      // Create date as if UTC, then find offset for the given timezone at that moment
      const utcDate = new Date(`${localStr}Z`)
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: tzid,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(utcDate)
      const p = Object.fromEntries(parts.map((p) => [p.type, p.value]))
      const tzUtc = new Date(`${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}Z`)
      const offset = utcDate.getTime() - tzUtc.getTime()
      return new Date(new Date(`${localStr}Z`).getTime() + offset).toISOString()
    } catch {
      // fall through to treating as local
    }
  }

  // Floating time, no TZID — treat as local
  return new Date(`${y}-${mo}-${d}T${h}:${min}:${s}`).toISOString()
}
