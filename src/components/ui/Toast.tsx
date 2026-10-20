'use client'

import { useEffect, useState } from 'react'

export interface ToastData {
  id: string
  message: string
  label?: string
  duration?: number
}

let toastListeners: ((toast: ToastData) => void)[] = []

export function showToast(data: Omit<ToastData, 'id'>) {
  const toast = { ...data, id: Math.random().toString(36).slice(2) }
  toastListeners.forEach((fn) => fn(toast))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([])

  useEffect(() => {
    const handler = (toast: ToastData) => {
      setToasts((prev) => [...prev, toast])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, toast.duration ?? 4000)
    }
    toastListeners.push(handler)
    return () => { toastListeners = toastListeners.filter((fn) => fn !== handler) }
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl px-4 py-3 shadow-xl text-sm max-w-xs text-center animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          {t.label && (
            <span className="font-semibold text-emerald-400 dark:text-emerald-600 block text-xs mb-0.5">
              {t.label}
            </span>
          )}
          {t.message}
        </div>
      ))}
    </div>
  )
}
