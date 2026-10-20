import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/ui/Nav'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ToastContainer } from '@/components/ui/Toast'
import { Providers } from './providers'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Secretary',
  description: 'Your personal AI secretary',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s!=='light'&&d)){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className={`${geist.className} bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100`}>
        <Providers>
          <div className="flex min-h-screen flex-col md:flex-row">
            <Nav />
            <main className="flex-1 pb-24 md:pb-0 max-w-2xl mx-auto w-full px-4 py-6">
              <div className="flex justify-end mb-4">
                <ThemeToggle />
              </div>
              {children}
            </main>
          </div>
          <ToastContainer />
        </Providers>
      </body>
    </html>
  )
}
