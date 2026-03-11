import { desc, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { pipelineRunsTable } from '@/lib/db/schema'

/** Runs older than this are considered stale (worker likely crashed) */
const STALE_MS = 5 * 60 * 1000

/**
 * GET /api/discovery/active — returns the most recent pipeline run if it's
 * still running (no completedAt) and not stale. Used by the feed page to
 * restore progress indicators after a page refresh.
 */
export async function GET() {
  const db = getDb()
  const [run] = await db
    .select()
    .from(pipelineRunsTable)
    .where(isNull(pipelineRunsTable.completedAt))
    .orderBy(desc(pipelineRunsTable.startedAt))
    .limit(1)

  if (!run) {
    return NextResponse.json({ data: null })
  }

  // Don't return stale runs — they'll never complete
  const age = Date.now() - new Date(run.startedAt!).getTime()
  if (age > STALE_MS) {
    return NextResponse.json({ data: null })
  }

  return NextResponse.json({
    data: { runId: run.id },
  })
}
