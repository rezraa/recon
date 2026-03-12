import { NextResponse } from 'next/server'

import { createEnrichQueue } from '@/worker/queues'

/**
 * POST /api/jobs/[id]/enrich
 *
 * Enqueues a BullMQ enrichment job for a partial LinkedIn job.
 * Fire-and-forget: returns 202 immediately, enrichment happens asynchronously.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const queue = createEnrichQueue()
    try {
      await queue.add('enrich.job', { jobId: id }, {
        jobId: `enrich-${id}`,
        removeOnComplete: true,
        removeOnFail: false,
      })
    } finally {
      await queue.close()
    }

    return NextResponse.json(
      { data: { status: 'enqueued', jobId: id } },
      { status: 202 },
    )
  } catch (err) {
    console.error('[POST /api/jobs/[id]/enrich]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: { code: 500, message: 'Failed to enqueue enrichment' } },
      { status: 500 },
    )
  }
}
