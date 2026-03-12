import { memo } from 'react'

import { BenefitTagList } from '@/components/common/BenefitTag'
import { ScoreRing } from '@/components/common/ScoreRing'
import { TableCell, TableRow } from '@/components/ui/table'
import type { JobItem } from '@/hooks/useJobs'
import { cn } from '@/lib/utils'
import { decodeHtmlEntities, formatDate, formatSalary, inferWorkStyle } from '@/lib/utils/format'

export function SourceAttribution({ sources }: { sources: Array<{ name: string }> }) {
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

  const handleJobClick = () => {
    if (job.partial && job.id) {
      fetch(`/api/jobs/${job.id}/enrich`, { method: 'POST' }).catch(() => {})
    }
  }

  return (
    <TableRow
      className={cn(
        'job-list-row transition-colors duration-100 hover:bg-muted/50',
        selected && 'selected',
        className,
      )}
    >
      <TableCell className="text-center pr-4">
        {job.matchScore !== null ? (
          <ScoreRing score={job.matchScore} partial={job.partial} />
        ) : job.partial ? (
          <ScoreRing score={0} partial />
        ) : (
          <span className="text-xs text-[var(--fg-muted)] font-mono">--</span>
        )}
      </TableCell>
      <TableCell className="pr-5">
        <div className="min-w-0">
          {job.sourceUrl ? (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline truncate block"
              onClick={handleJobClick}
            >
              {title}
            </a>
          ) : (
            <span className="text-sm font-medium truncate block">
              {title}
            </span>
          )}
          <span className="text-[13px] text-muted-foreground truncate block">
            {company}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center px-4">
        {salaryText && (
          <span className="text-sm font-mono text-[var(--tag-salary)] whitespace-nowrap">
            {salaryText}
          </span>
        )}
      </TableCell>
      <TableCell className="text-center pl-4">
        <div className="flex items-center justify-center gap-1.5 text-sm">
          <WorkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground truncate">{workStyle.label}</span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        {job.benefits && job.benefits.length > 0 && (
          <BenefitTagList benefits={job.benefits} maxVisible={3} />
        )}
      </TableCell>
      <TableCell className="text-center">
        <span className="text-[13px] text-muted-foreground whitespace-nowrap">
          <SourceAttribution sources={job.sources ?? []} />
        </span>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-[13px] text-muted-foreground whitespace-nowrap">
          {formatDate(job.discoveredAt)}
        </span>
      </TableCell>
    </TableRow>
  )
})
