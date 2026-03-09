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
  // 'running' = still in progress, 'completed' = done (may have partial source errors),
  // 'failed' = done but ALL sources failed (zero succeeded)
  let status: 'running' | 'completed' | 'failed'
  if (!run.completedAt) {
    status = 'running'
  } else if ((run.sourcesSucceeded ?? 0) === 0 && (run.sourcesFailed ?? 0) > 0) {
    status = 'failed'
  } else {
    status = 'completed'
  }

  const sourcesCompleted = (run.sourcesSucceeded ?? 0) + (run.sourcesFailed ?? 0)
  const sourcesTotal = (run.sourcesAttempted ?? 0)

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
