import { count, desc, eq } from 'drizzle-orm'
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
  pipelineStage: jobsTable.pipelineStage,
  discoveredAt: jobsTable.discoveredAt,
} as const

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || 20), 100)
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)

  try {
    const db = getDb()

    const jobs = await db
      .select(feedColumns)
      .from(jobsTable)
      .where(eq(jobsTable.isDismissed, false))
      .orderBy(desc(jobsTable.matchScore))
      .limit(limit)
      .offset(offset)

    const [{ count: total }] = await db
      .select({ count: count() })
      .from(jobsTable)
      .where(eq(jobsTable.isDismissed, false))

    return NextResponse.json({
      data: {
        jobs,
        total: Number(total),
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 },
    )
  }
}
