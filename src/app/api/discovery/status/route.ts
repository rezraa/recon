import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { pipelineRunsTable } from '@/lib/db/schema'

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
  // Stale detection: if started > 5 min ago with no completedAt, treat as completed
  const STALE_MS = 5 * 60 * 1000
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

  return NextResponse.json({
    data: {
      status,
      sources_completed: sourcesCompleted,
      sources_total: sourcesTotal,
      listings_new: run.listingsNew ?? 0,
      started_at: run.startedAt,
    },
  })
}
