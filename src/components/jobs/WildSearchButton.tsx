'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type SearchState = 'idle' | 'searching' | 'found'

interface WildSearchButtonProps {
  query: string
  onSearchComplete?: () => void
  /** Called after the "Found X" message fades (3s after results). Use to clear search input. */
  onDone?: () => void
  variant?: 'default' | 'primary'
}

export function WildSearchButton({ query, onSearchComplete, onDone, variant = 'default' }: WildSearchButtonProps) {
  const [state, setState] = useState<SearchState>('idle')
  const [foundCount, setFoundCount] = useState(0)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset to idle when query changes
  useEffect(() => {
    setState('idle')
    setFoundCount(0)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
  }, [query])

  const handleClick = useCallback(async () => {
    if (state === 'searching') return

    setState('searching')
    try {
      const res = await fetch('/api/jobs/search-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const body = await res.json()
      const count = body.data?.found ?? 0

      setFoundCount(count)
      setState('found')
      onSearchComplete?.()

      // Fade back to idle after 3s, then notify parent
      fadeTimerRef.current = setTimeout(() => {
        setState('idle')
        onDone?.()
      }, 3000)
    } catch {
      setState('idle')
    }
  }, [query, state, onSearchComplete, onDone])

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  if (!query.trim()) return null

  const isPrimary = variant === 'primary'
  const baseClasses = isPrimary
    ? 'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-300'
    : 'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-300'

  if (state === 'searching') {
    return (
      <button
        className={`${baseClasses} relative overflow-hidden border border-yellow-500/30 bg-yellow-500/10 text-yellow-400`}
        disabled
      >
        <span className="relative z-10">Searching...</span>
        <span
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(250,204,21,0.3), transparent)',
            animation: 'pulse-sweep 1.8s ease-in-out infinite',
          }}
        />
      </button>
    )
  }

  if (state === 'found') {
    return (
      <button
        className={`${baseClasses} border border-green-500/30 bg-green-500/10 text-green-400`}
        disabled
        style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
      >
        Found {foundCount} new result{foundCount !== 1 ? 's' : ''}
      </button>
    )
  }

  return (
    <button
      className={`${baseClasses} ${isPrimary
        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
        : 'border border-input bg-background text-foreground hover:bg-muted/50'
      }`}
      onClick={handleClick}
    >
      Search in the Wild
    </button>
  )
}
