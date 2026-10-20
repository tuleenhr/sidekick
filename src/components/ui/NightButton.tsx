'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function NightButton() {
  const [show, setShow] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function check() {
      const hour = new Date().getHours()
      setShow(hour >= 19 || hour < 4)
    }
    check()
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [])

  if (!show) return null

  return (
    <button
      onClick={() => router.push('/night')}
      className="text-lg hover:scale-110 transition-transform"
      title="Night debrief"
      aria-label="Night debrief"
    >
      🌙
    </button>
  )
}
