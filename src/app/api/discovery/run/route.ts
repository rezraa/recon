import { NextResponse } from 'next/server'

import { SOURCE_CONFIGS } from '@/lib/adapters/constants'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { createDiscoveryQueue } from '@/worker/queues'

export async function POST() {
  const db = getDb()

  // Load enabled sources — auto-seed open sources on first run
  let allSources = await db.select().from(schema.sourcesTable)
  if (allSources.length === 0) {
    const openSources = Object.values(SOURCE_CONFIGS)
      .filter((c) => c.type === 'open')
      .map((c) => ({
        name: c.name,
        displayName: c.displayName,
        type: c.type,
        isEnabled: true,
      }))
    if (openSources.length > 0) {
      allSources = await db
        .insert(schema.sourcesTable)
        .values(openSources)
        .returning()
    }
  }
  const enabledSources = allSources.filter((s) => s.isEnabled)

  if (enabledSources.length === 0) {
    return NextResponse.json(
      { error: 'No enabled sources configured' },
      { status: 400 },
    )
  }

  // Create pipeline run record
  const [run] = await db
    .insert(schema.pipelineRunsTable)
    .values({ startedAt: new Date() })
    .returning()

  const runId = run.id
  const sourceNames = enabledSources.map((s) => s.name)

  // Enqueue discovery pipeline job
  const queue = createDiscoveryQueue()
  await queue.add('pipeline.run', { runId, sourceNames }, {
    removeOnComplete: true,
    removeOnFail: false,
  })
  await queue.close()

  return NextResponse.json(
    { data: { runId, status: 'running' } },
    { status: 202 },
  )
}
