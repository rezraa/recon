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

  // Fetching or scoring state
  const isFetching = status === 'fetching'
  const message = isFetching
    ? sourcesTotal > 0
      ? `— ${sourcesCompleted} of ${sourcesTotal} sources checked. Hang tight, this can take a minute.`
      : '— Starting up, please be patient...'
    : '— Analyzing and matching each listing to your resume. This is the slow part — hang tight.'

  return (
    <div className="rounded-md border border-[var(--primary)] bg-[hsl(210_65%_75%_/_0.1)] px-4 py-3 text-sm">
      <span className="font-medium text-[var(--primary)]">
        {isFetching ? 'Finding new opportunities for you' : 'Matching jobs to your profile'}
      </span>{' '}
      <span className="text-[var(--fg-muted)]">
        {message}
      </span>
    </div>
  )
}
