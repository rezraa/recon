import { and, count, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { jobsTable } from '@/lib/db/schema'

const DEFAULT_COUNTRIES = ['US', 'Unknown']

const feedColumns = {
  id: jobsTable.id,
  title: jobsTable.title,
  company: jobsTable.company,
  salaryMin: jobsTable.salaryMin,
  salaryMax: jobsTable.salaryMax,
  location: jobsTable.location,
  isRemote: jobsTable.isRemote,
  sourceUrl: jobsTable.sourceUrl,
  sourceName: jobsTable.sourceName,
  sources: jobsTable.sources,
  dedupConfidence: jobsTable.dedupConfidence,
  matchScore: jobsTable.matchScore,
  matchBreakdown: jobsTable.matchBreakdown,
  pipelineStage: jobsTable.pipelineStage,
  country: jobsTable.country,
  partial: jobsTable.partial,
  discoveredAt: jobsTable.discoveredAt,
  benefits: jobsTable.benefits,
} as const

/** Compute dynamic threshold: 75th percentile of scored jobs within country filter */
async function computeThreshold(
  db: ReturnType<typeof getDb>,
  baseConditions: ReturnType<typeof eq>[],
): Promise<number> {
  const result = await db
    .select({
      p75: sql<number>`COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY ${jobsTable.matchScore}), 0)::int`,
    })
    .from(jobsTable)
    .where(and(...baseConditions, gte(jobsTable.matchScore, 1)))

  return result[0]?.p75 ?? 0
}

/** Parse countries query parameter. Returns null if "all" (no filter). */
export function parseCountries(param: string | null): string[] | null {
  if (!param) return DEFAULT_COUNTRIES
  if (param.toLowerCase() === 'all') return null
  const parsed = param.split(',').map((c) => c.trim()).filter(Boolean)
  return parsed.length > 0 ? parsed : DEFAULT_COUNTRIES
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || 100), 200)
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)
  const showAll = searchParams.get('showAll') === 'true'
  const countries = parseCountries(searchParams.get('countries'))
  const rawQuery = searchParams.get('q')?.trim() || null
  const query = rawQuery && rawQuery.length <= 200 ? rawQuery : null

  try {
    const db = getDb()

    // Build base conditions
    const conditions = [eq(jobsTable.isDismissed, false)]

    // Apply country filter (null = show all countries)
    if (countries) {
      conditions.push(inArray(jobsTable.country, countries))
    }

    // When no search query, exclude partial jobs from default feed
    if (!query) {
      conditions.push(eq(jobsTable.partial, false))
    }

    // Apply text search filter
    if (query) {
      const pattern = `%${query}%`
      conditions.push(
        or(
          ilike(jobsTable.title, pattern),
          ilike(jobsTable.company, pattern),
          ilike(jobsTable.descriptionText, pattern),
        )!,
      )
    }

    let whereClause = and(...conditions)!

    let threshold: number | null = null
    if (!showAll) {
      try {
        const p75 = await computeThreshold(db, conditions)
        if (p75 > 0) {
          // Only apply threshold if it gives at least 20 results
          const [{ count: aboveCount }] = await db
            .select({ count: count() })
            .from(jobsTable)
            .where(and(...conditions, gte(jobsTable.matchScore, p75)))

          if (Number(aboveCount) >= 20) {
            threshold = p75
            whereClause = and(...conditions, gte(jobsTable.matchScore, threshold))!
          }
        }
      } catch {
        // Threshold computation failed (e.g. no scored jobs) — show all non-dismissed
      }
    }

    const jobs = await db
      .select(feedColumns)
      .from(jobsTable)
      .where(whereClause)
      .orderBy(desc(jobsTable.matchScore))
      .limit(limit)
      .offset(offset)

    const [{ count: total }] = await db
      .select({ count: count() })
      .from(jobsTable)
      .where(whereClause)

    return NextResponse.json({
      data: {
        jobs,
        total: Number(total),
        threshold,
      },
    })
  } catch (err) {
    console.error('[GET /api/jobs]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 },
    )
  }
}
