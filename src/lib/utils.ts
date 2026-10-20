import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function urgencyToVariant(urgency: string) {
  const map: Record<string, 'red' | 'orange' | 'yellow' | 'grey'> = {
    red: 'red',
    orange: 'orange',
    yellow: 'yellow',
    grey: 'grey',
  }
  return map[urgency?.toLowerCase()] || 'grey'
}

export function bucketColor(bucket: string) {
  const map: Record<string, string> = {
    body: 'border-red-400',
    admin: 'border-yellow-400',
    growth: 'border-green-400',
    joy: 'border-blue-400',
  }
  return map[bucket] || 'border-zinc-300'
}

export function bucketBadgeVariant(bucket: string): 'red' | 'yellow' | 'green' | 'blue' {
  const map: Record<string, 'red' | 'yellow' | 'green' | 'blue'> = {
    body: 'red',
    admin: 'yellow',
    growth: 'green',
    joy: 'blue',
  }
  return map[bucket] || 'grey' as any
}

export function statusVariant(status: string): 'red' | 'orange' | 'yellow' | 'grey' {
  const map: Record<string, 'red' | 'orange' | 'yellow' | 'grey'> = {
    MUST_TODAY: 'red',
    SOON: 'orange',
    CAN_WAIT: 'yellow',
    FAKE_URGENT: 'grey',
  }
  return map[status] || 'grey'
}

export function daysUntil(date: string) {
  const d = new Date(date)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}
