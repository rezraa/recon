'use client'

import { useEffect, useRef } from 'react'

import { useDiscoveryStatus } from '@/hooks/useDiscoveryStatus'

interface DiscoveryBannerProps {
  runId: string | null
  onComplete?: () => void
}

export function DiscoveryBanner({ runId, onComplete }: DiscoveryBannerProps) {
  const { status, sourcesCompleted, sourcesTotal, listingsNew, isComplete } =
    useDiscoveryStatus(runId)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (isComplete && onCompleteRef.current) {
      onCompleteRef.current()
    }
  }, [isComplete])

  if (!runId || status === null) return null

  if (status === 'failed') {
    return (
      <div className="rounded-md border border-[var(--match-low)] bg-[var(--match-low-bg)] px-4 py-3 text-sm">
        <span className="font-medium text-[var(--match-low)]">
          Discovery failed.
        </span>{' '}
        <span className="text-[var(--fg-muted)]">
          All sources encountered errors. Check source configuration and try again.
        </span>
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <div className="rounded-md border border-[var(--match-high)] bg-[var(--match-high-bg)] px-4 py-3 text-sm">
        <span className="font-medium text-[var(--match-high)]">
          Discovery complete.
        </span>{' '}
        <span className="text-[var(--fg-muted)]">
          Found {listingsNew} new listing{listingsNew !== 1 ? 's' : ''}.
        </span>
      </div>
    )
  }

  // Running state
  return (
    <div className="rounded-md border border-[var(--primary)] bg-[hsl(210_65%_75%_/_0.1)] px-4 py-3 text-sm">
      <span className="font-medium text-[var(--primary)]">
        Discovering jobs...
      </span>{' '}
      <span className="text-[var(--fg-muted)]">
        {sourcesTotal > 0
          ? `${sourcesCompleted}/${sourcesTotal} sources complete`
          : 'Starting pipeline...'}
      </span>
    </div>
  )
}
