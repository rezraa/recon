import { cn } from '@/lib/utils'

type MatchVariant = 'high' | 'medium' | 'low'

function getVariant(score: number): MatchVariant {
  if (score >= 80) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

const variantStyles: Record<MatchVariant, string> = {
  high: 'text-[var(--match-high)] bg-[var(--match-high-bg)]',
  medium: 'text-[var(--match-medium)] bg-[var(--match-medium-bg)]',
  low: 'text-[var(--match-low)] bg-[var(--match-low-bg)]',
}

interface MatchBadgeProps {
  score: number | null
  className?: string
}

export function MatchBadge({ score, className }: MatchBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className={cn(
        'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium font-mono',
        'text-[var(--fg-muted)] bg-[var(--bg-hover)]',
        className,
      )}>
        --
      </span>
    )
  }

  const variant = getVariant(score)

  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium font-mono',
      variantStyles[variant],
      className,
    )}>
      {score}%
    </span>
  )
}
