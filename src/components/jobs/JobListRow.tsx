import { Building2, Globe, RefreshCw } from 'lucide-react'
import { memo } from 'react'

import { MatchBadge } from '@/components/common/MatchBadge'
import { BenefitTagList } from '@/components/common/BenefitTag'
import { TableCell, TableRow } from '@/components/ui/table'
import type { JobItem } from '@/hooks/useJobs'
import { cn } from '@/lib/utils'

/** Decode HTML entities like &#038; &amp; &lt; etc. from source-scraped text */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

function formatSalary(min: number | null, max: number | null): string {
  const lo = min && min > 0 ? min : null
  const hi = max && max > 0 ? max : null
  if (lo && hi) return `$${Math.round(lo / 1000)}k – $${Math.round(hi / 1000)}k`
  if (lo) return `$${Math.round(lo / 1000)}k+`
  if (hi) return `Up to $${Math.round(hi / 1000)}k`
  return ''
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

/** Infer work style from isRemote flag and location text */
function inferWorkStyle(isRemote: boolean, location: string | null): { label: string; icon: typeof Globe } {
  if (isRemote) return { label: 'Remote', icon: Globe }
  const loc = (location ?? '').toLowerCase()
  if (loc.includes('hybrid')) return { label: 'Hybrid', icon: RefreshCw }
  return { label: 'On-site', icon: Building2 }
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

interface JobListRowProps {
  job: JobItem
  selected?: boolean
  className?: string
}

export const JobListRow = memo(function JobListRow({ job, selected, className }: JobListRowProps) {
  const salaryText = formatSalary(job.salaryMin, job.salaryMax)
  const title = job.title ? decodeHtmlEntities(job.title) : 'Untitled'
  const company = job.company ? decodeHtmlEntities(job.company) : '—'
  const workStyle = inferWorkStyle(job.isRemote, job.location)
  const WorkIcon = workStyle.icon

  return (
    <TableRow
      className={cn(
        'job-list-row transition-colors duration-100 hover:bg-muted/50',
        selected && 'selected',
        className,
      )}
    >
      <TableCell className="text-center">
        <MatchBadge score={job.matchScore} />
      </TableCell>
      <TableCell>
        <div className="min-w-0">
          {job.sourceUrl ? (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline truncate block"
            >
              {title}
            </a>
          ) : (
            <span className="text-sm font-medium truncate block">
              {title}
            </span>
          )}
          <span className="text-xs text-muted-foreground truncate block">
            {company}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        {salaryText && (
          <span className="text-xs font-mono text-[var(--tag-salary)] whitespace-nowrap">
            {salaryText}
          </span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1 text-xs whitespace-nowrap">
          <WorkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{workStyle.label}</span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-xs truncate block">{job.location ?? '—'}</span>
      </TableCell>
      <TableCell className="text-center">
        <BenefitTagList benefits={job.benefits ?? []} />
      </TableCell>
      <TableCell className="text-center">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          <SourceAttribution sources={job.sources ?? []} />
        </span>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {formatDate(job.discoveredAt)}
        </span>
      </TableCell>
    </TableRow>
  )
})
