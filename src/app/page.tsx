'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useResumeRedirect } from '@/hooks/useResume'

export default function Home() {
  const { isLoading } = useResumeRedirect({
    redirectTo: '/onboarding',
    when: 'missing',
  })
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }

  const handleRunDiscovery = async () => {
    setIsRunning(true)
    setDiscoveryError(null)
    try {
      const res = await fetch('/api/discovery/run', { method: 'POST' })
      if (!res.ok) {
        setDiscoveryError('Failed to start discovery. Please try again.')
      }
    } catch {
      setDiscoveryError('Network error. Please check your connection and try again.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-semibold tracking-tight">Recon</h1>
      <p className="text-muted-foreground">Welcome back! Run discovery to find jobs.</p>
      {discoveryError && (
        <p className="text-sm text-destructive">{discoveryError}</p>
      )}
      <Button onClick={handleRunDiscovery} disabled={isRunning}>
        {isRunning ? 'Starting...' : 'Run Discovery Now'}
      </Button>
    </div>
  )
}
