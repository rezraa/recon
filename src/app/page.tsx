'use client'

import { Settings } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DiscoveryBanner } from '@/components/DiscoveryBanner'
import { JobListRow } from '@/components/jobs/JobListRow'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useJobs } from '@/hooks/useJobs'
import { useResumeRedirect } from '@/hooks/useResume'

/** Auto-trigger discovery when feed is empty and no run is active */
function AutoDiscovery({ onStart }: { onStart: () => void }) {
  const triggered = useRef(false)
  useEffect(() => {
    if (!triggered.current) {
      triggered.current = true
      onStart()
    }
  }, [onStart])
  return null
}

export default function Home() {
  const { data: resumeData, isLoading: isResumeLoading } = useResumeRedirect({
    redirectTo: '/onboarding',
    when: 'missing',
  })
  const [showAll, setShowAll] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('recon:showAllJobs') === 'true'
    }
    return false
  })
  const { jobs, total, isLoading: isJobsLoading, mutate } = useJobs(
    showAll ? { showAll: true } : undefined,
  )
  const [runId, setRunId] = useState<string | null>(null)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore active discovery run on page load (survives refresh)
  useEffect(() => {
    let cancelled = false
    async function checkActiveRun() {
      try {
        const res = await fetch('/api/discovery/active')
        if (!res.ok) return
        const body = await res.json()
        if (!cancelled && body.data?.runId) {
          setRunId(body.data.runId)
        }
      } catch {
        // Ignore — non-critical
      }
    }
    checkActiveRun()
    return () => { cancelled = true }
  }, [])

  const handleDiscoveryComplete = useCallback(() => {
    mutate()
    // Refresh again after a beat to catch any final score updates
    setTimeout(() => mutate(), 2000)
    // Keep banner visible briefly showing "Discovery complete", then clear
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    bannerTimerRef.current = setTimeout(() => setRunId(null), 5000)
  }, [mutate])

  if (isResumeLoading || !resumeData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }

  const handleRunDiscovery = async () => {
    setIsStarting(true)
    setDiscoveryError(null)
    try {
      const res = await fetch('/api/discovery/run', { method: 'POST' })
      if (!res.ok) {
        setDiscoveryError('Failed to start discovery. Please try again.')
        return
      }
      const body = await res.json()
      setRunId(body.data.runId)
    } catch {
      setDiscoveryError('Network error. Please check your connection and try again.')
    } finally {
      setIsStarting(false)
    }
  }

  const isLoading = isJobsLoading
  const isEmpty = !isLoading && jobs.length === 0

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recon</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} job${total !== 1 ? 's' : ''} discovered` : 'Job intelligence feed'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <Button
              onClick={handleRunDiscovery}
              disabled={isStarting || runId !== null}
              size="sm"
            >
              {isStarting ? 'Starting...' : 'Run Discovery'}
            </Button>
          )}
          <Link href="/settings">
            <Button variant="ghost" size="sm" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {discoveryError && (
        <p className="mb-4 text-sm text-destructive">{discoveryError}</p>
      )}

      <div className="mb-4">
        <DiscoveryBanner runId={runId} onComplete={handleDiscoveryComplete} />
      </div>

      {!isEmpty && !isLoading && (
        <div className="mb-4 flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => {
                setShowAll(e.target.checked)
                localStorage.setItem('recon:showAllJobs', String(e.target.checked))
              }}
              className="rounded"
            />
            Show all jobs
          </label>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-6 w-[60px] rounded-full" />
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      )}

      {runId !== null && (
        <div className="discovery-pulse" />
      )}

      {isEmpty && !runId && resumeData && (
        <AutoDiscovery onStart={handleRunDiscovery} />
      )}

      {!isLoading && jobs.length > 0 && (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[4%] text-center">Match</TableHead>
              <TableHead className="w-[22%]">Title / Company</TableHead>
              <TableHead className="w-[11%] text-center">Salary</TableHead>
              <TableHead className="w-[8%] text-center">Work Style</TableHead>
              <TableHead className="w-[12%] text-center">Location</TableHead>
              <TableHead className="w-[25%] text-center">Benefits</TableHead>
              <TableHead className="w-[8%] text-center">Source</TableHead>
              <TableHead className="w-[10%] text-center">Discovered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <JobListRow key={job.id} job={job} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
