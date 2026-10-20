'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: 'Today', icon: '☀️' },
  { href: '/inbox', label: 'Inbox', icon: '✉️' },
  { href: '/deadlines', label: 'Deadlines', icon: '🗓' },
  { href: '/chat', label: 'Chat', icon: '💬' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Nav() {
  const path = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:relative md:border-t-0 md:border-r md:w-52 md:min-h-screen md:flex-col">
      <div className="flex md:flex-col md:pt-8 md:px-4 md:gap-1">
        <div className="hidden md:block px-3 mb-8">
          <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Secretary</span>
        </div>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'flex flex-1 md:flex-none flex-col md:flex-row items-center md:items-center gap-0.5 md:gap-3 py-3 px-2 md:px-3 md:py-2.5 text-xs md:text-sm rounded-lg transition-colors',
              path === l.href
                ? 'text-zinc-900 font-medium bg-zinc-100 dark:text-white dark:bg-zinc-800'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <span className="text-base md:text-sm">{l.icon}</span>
            <span>{l.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
