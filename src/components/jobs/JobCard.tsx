import { memo } from 'react'

import { BenefitTagList } from '@/components/common/BenefitTag'
import { ScoreRing } from '@/components/common/ScoreRing'
import { SourceAttribution } from '@/components/jobs/JobListRow'
import { Card } from '@/components/ui/card'
import type { JobItem } from '@/hooks/useJobs'
import { cn } from '@/lib/utils'
import { decodeHtmlEntities, formatDate, formatSalary, inferWorkStyle } from '@/lib/utils/format'

interface JobCardProps {
  job: JobItem
  onSelect: (job: JobItem) => void
  selected?: boolean
  className?: string
}

export const JobCard = memo(function JobCard({ job, onSelect, selected, className }: JobCardProps) {
  const title = job.title ? decodeHtmlEntities(job.title) : 'Untitled'
  const company = job.company ? decodeHtmlEntities(job.company) : '—'
  const salaryText = formatSalary(job.salaryMin, job.salaryMax)
  const workStyle = inferWorkStyle(job.isRemote, job.location)
  const WorkIcon = workStyle.icon

  const handleClick = () => {
    if (job.partial && job.id) {
      fetch(`/api/jobs/${job.id}/enrich`, { method: 'POST' }).catch(() => {})
    }
    onSelect(job)
    if (job.sourceUrl) {
      window.open(job.sourceUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Card
      role="article"
      onClick={handleClick}
      className={cn(
        'cursor-pointer p-4 transition-all duration-200',
        'hover:border-[var(--border-hover)] hover:shadow-sm hover:-translate-y-0.5',
        selected && 'border-l-2 border-l-primary',
        className,
      )}
    >
      {/* Header: ScoreRing + Title + Company */}
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {job.matchScore !== null ? (
            <ScoreRing score={job.matchScore} partial={job.partial} />
          ) : job.partial ? (
            <ScoreRing score={0} partial />
          ) : (
            <span className="text-xs text-[var(--fg-muted)] font-mono">--</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{title}</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground truncate">{company}</p>
            <WorkIcon className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
          </div>
        </div>
      </div>

      {/* Salary */}
      {salaryText && (
        <p data-testid="card-salary" className="mt-2 text-xs font-mono text-[var(--tag-salary)]">
          {salaryText}
        </p>
      )}

      {/* Location + Work Style */}
      <p className="mt-1 text-xs text-muted-foreground truncate">
        {workStyle.label}
      </p>

      {/* Benefits */}
      {job.benefits && job.benefits.length > 0 && (
        <div className="mt-2">
          <BenefitTagList benefits={job.benefits} maxVisible={3} className="justify-start" />
        </div>
      )}

      {/* Footer: Source + Date */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <SourceAttribution sources={job.sources ?? []} />
        <span>{formatDate(job.discoveredAt)}</span>
      </div>
    </Card>
  )
})
