import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { jobsTable } from '@/lib/db/schema'

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
  discoveredAt: jobsTable.discoveredAt,
} as const

/** Compute dynamic threshold: 75th percentile of scored jobs */
async function computeThreshold(db: ReturnType<typeof getDb>): Promise<number> {
  const result = await db
    .select({
      p75: sql<number>`COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY ${jobsTable.matchScore}), 0)::int`,
    })
    .from(jobsTable)
    .where(and(eq(jobsTable.isDismissed, false), gte(jobsTable.matchScore, 1)))

  return result[0]?.p75 ?? 0
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || 100), 200)
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)
  const showAll = searchParams.get('showAll') === 'true'

  try {
    const db = getDb()

    let whereClause = eq(jobsTable.isDismissed, false)

    let threshold: number | null = null
    if (!showAll) {
      try {
        const p75 = await computeThreshold(db)
        if (p75 > 0) {
          // Only apply threshold if it gives at least 20 results
          const [{ count: aboveCount }] = await db
            .select({ count: count() })
            .from(jobsTable)
            .where(and(eq(jobsTable.isDismissed, false), gte(jobsTable.matchScore, p75)))

          if (Number(aboveCount) >= 20) {
            threshold = p75
            whereClause = and(eq(jobsTable.isDismissed, false), gte(jobsTable.matchScore, threshold))!
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
