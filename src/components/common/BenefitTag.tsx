import { cn } from '@/lib/utils'

// ─── Benefit Classification (8 hardcoded categories) ─────────────────────────
// Benefits are a finite, universal vocabulary. These 8 categories cover the
// decision-drivers that job seekers actually scan for. Remote is excluded —
// it's a work arrangement, not a benefit (shown in Work Style column).
// Order matters: specific patterns (Unlimited PTO) must precede general (PTO),
// and Equity must precede Bonus to win ties like "equity and bonus package".

interface BenefitCategory {
  short: string
  colorClass: string
  patterns: RegExp[]
}

const BENEFIT_CATEGORIES: BenefitCategory[] = [
  { short: 'Health', colorClass: 'list-tag tag-health', patterns: [/health|medical|dental|vision|wellness/i] },
  { short: 'Unlimited PTO', colorClass: 'list-tag tag-pto', patterns: [/unlimited\s+(?:pto|vacation|time.off)/i] },
  { short: 'PTO', colorClass: 'list-tag tag-pto', patterns: [/\bpto\b|vacation|time.off|paid.leave|holiday/i] },
  { short: '401k', colorClass: 'list-tag tag-401k', patterns: [/401k|retirement|pension/i] },
  { short: 'Equity', colorClass: 'list-tag tag-equity', patterns: [/equity|stock|\brsu\b|option/i] },
  { short: 'Bonus', colorClass: 'list-tag tag-bonus', patterns: [/bonus|incentive|commission/i] },
  { short: 'Parental', colorClass: 'list-tag tag-parental', patterns: [/parental|maternity|paternity|family.leave/i] },
  { short: 'Pet', colorClass: 'list-tag tag-pet', patterns: [/\bpet\b|dog.friendly/i] },
]

/** Classify a verbose benefit string into a short canonical label + color */
export function classifyBenefit(raw: string): { short: string; colorClass: string } | null {
  for (const cat of BENEFIT_CATEGORIES) {
    if (cat.patterns.some(p => p.test(raw))) {
      return { short: cat.short, colorClass: cat.colorClass }
    }
  }
  // Unrecognized benefits are not shown as tags — they live in the "+N" overflow tooltip
  return null
}

/** Deduplicate and shorten a list of verbose benefits into concise tags */
export function condenseBenefits(benefits: string[]): Array<{ short: string; colorClass: string; originals: string[] }> {
  const seen = new Map<string, { short: string; colorClass: string; originals: string[] }>()
  let uncategorized = 0

  for (const raw of benefits) {
    const classified = classifyBenefit(raw)
    if (!classified) {
      uncategorized++
      continue
    }
    const existing = seen.get(classified.short)
    if (existing) {
      existing.originals.push(raw)
    } else {
      seen.set(classified.short, { short: classified.short, colorClass: classified.colorClass, originals: [raw] })
    }
  }

  return Array.from(seen.values())
}

// ─── Components ──────────────────────────────────────────────────────────────

interface BenefitTagProps {
  label: string
  colorClass?: string
  title?: string
  className?: string
}

export function BenefitTag({ label, colorClass, title, className }: BenefitTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded',
        colorClass ?? 'list-tag',
        className,
      )}
      title={title ?? label}
    >
      {label}
    </span>
  )
}

interface BenefitTagListProps {
  benefits: string[]
  maxVisible?: number
  className?: string
}

export function BenefitTagList({ benefits, maxVisible = 4, className }: BenefitTagListProps) {
  if (!benefits || benefits.length === 0) return null

  const condensed = condenseBenefits(benefits)
  if (condensed.length === 0) return null

  const visible = condensed.slice(0, maxVisible)
  const overflow = condensed.length - maxVisible

  return (
    <div className={cn('flex items-center justify-center gap-1.5 flex-nowrap', className)}>
      {visible.map((b) => (
        <BenefitTag
          key={b.short}
          label={b.short}
          colorClass={b.colorClass}
          title={b.originals.join(', ')}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[11px] text-muted-foreground">+{overflow}</span>
      )}
    </div>
  )
}
