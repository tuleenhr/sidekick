export async function fireConfetti() {
  if (typeof window === 'undefined') return
  const confetti = (await import('canvas-confetti')).default
  confetti({
    particleCount: 60,
    spread: 50,
    origin: { y: 0.7 },
    colors: ['#a3e635', '#34d399', '#60a5fa', '#f472b6'],
    ticks: 120,
    gravity: 1.2,
    scalar: 0.8,
    disableForReducedMotion: true,
  })
}
