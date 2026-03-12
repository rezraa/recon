import { and, count, eq, gte } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { jobsTable, pipelineRunsTable } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('runId')

  if (!runId) {
    return NextResponse.json(
      { error: 'runId query parameter is required' },
      { status: 400 },
    )
  }

  const db = getDb()
  const [run] = await db
    .select()
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.id, runId))
    .limit(1)

  if (!run) {
    return NextResponse.json(
      { error: 'Pipeline run not found' },
      { status: 404 },
    )
  }

  // Derive status
  // 'fetching' = sources still being checked
  // 'scoring' = all sources done, scoring/inserting in progress (no completedAt yet)
  // 'completed' = done (may have partial source errors)
  // 'failed' = done but ALL sources failed (zero succeeded)
  // Stale detection: if started > 15 min ago with no completedAt, treat as completed
  // (LLM scoring ~34 jobs sequentially can take 10+ minutes)
  const STALE_MS = 15 * 60 * 1000
  const sourcesCompleted = (run.sourcesSucceeded ?? 0) + (run.sourcesFailed ?? 0)
  const sourcesTotal = (run.sourcesAttempted ?? 0)

  let status: 'fetching' | 'scoring' | 'completed' | 'failed'
  if (!run.completedAt) {
    const age = Date.now() - new Date(run.startedAt!).getTime()
    if (age > STALE_MS) {
      status = (run.sourcesSucceeded ?? 0) > 0 ? 'completed' : 'failed'
    } else if (sourcesTotal > 0 && sourcesCompleted >= sourcesTotal) {
      status = 'scoring'
    } else {
      status = 'fetching'
    }
  } else if ((run.sourcesSucceeded ?? 0) === 0 && (run.sourcesFailed ?? 0) > 0) {
    status = 'failed'
  } else {
    status = 'completed'
  }

  // Count jobs scored during this run (inserted since run started with a match_score)
  let listingsScored = 0
  if (status === 'scoring' && run.startedAt) {
    const [{ count: scored }] = await db
      .select({ count: count() })
      .from(jobsTable)
      .where(
        and(
          gte(jobsTable.discoveredAt, new Date(run.startedAt)),
          gte(jobsTable.matchScore, 0),
        ),
      )
    listingsScored = Number(scored)
  }

  return NextResponse.json({
    data: {
      status,
      sources_completed: sourcesCompleted,
      sources_total: sourcesTotal,
      listings_fetched: run.listingsFetched ?? 0,
      listings_new: run.listingsNew ?? 0,
      listings_scored: listingsScored,
      started_at: run.startedAt,
    },
  })
}
