'use client'

import { Settings } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'

import { DiscoveryBanner } from '@/components/DiscoveryBanner'
import { MatchBadge } from '@/components/MatchBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useJobs } from '@/hooks/useJobs'
import { useResumeRedirect } from '@/hooks/useResume'

function formatSalary(min: number | null, max: number | null): string {
  const lo = min && min > 0 ? min : null
  const hi = max && max > 0 ? max : null
  if (lo && hi) return `$${Math.round(lo / 1000)}k – $${Math.round(hi / 1000)}k`
  if (lo) return `$${Math.round(lo / 1000)}k+`
  if (hi) return `Up to $${Math.round(hi / 1000)}k`
  return '—'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SourceAttribution({ sources }: { sources: Array<{ name: string }> }) {
  if (sources.length <= 1) {
    return <span className="text-muted-foreground">{sources[0]?.name ?? '—'}</span>
  }
  return (
    <span className="text-muted-foreground">
      Found on {sources.length} sources
    </span>
  )
}

export default function Home() {
  const { isLoading: isResumeLoading } = useResumeRedirect({
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

  const handleDiscoveryComplete = useCallback(() => {
    mutate()
    // Keep banner visible briefly, then clear
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    bannerTimerRef.current = setTimeout(() => setRunId(null), 5000)
  }, [mutate])

  if (isResumeLoading) {
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
    <div className="mx-auto max-w-6xl px-6 py-8">
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
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16">
          <p className="text-muted-foreground">
            No jobs discovered yet. Run discovery to get started.
          </p>
          <Button onClick={handleRunDiscovery} disabled={isStarting || runId !== null}>
            Run Discovery Now
          </Button>
        </div>
      )}

      {!isLoading && jobs.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">Match</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Discovered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <MatchBadge score={job.matchScore} />
                </TableCell>
                <TableCell className="font-medium">
                  {job.sourceUrl ? (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {job.title ?? 'Untitled'}
                    </a>
                  ) : (
                    job.title ?? 'Untitled'
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {job.company ?? '—'}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {formatSalary(job.salaryMin, job.salaryMax)}
                </TableCell>
                <TableCell className="text-sm">
                  <SourceAttribution sources={job.sources ?? []} />
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatDate(job.discoveredAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
