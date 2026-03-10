import { NextResponse } from 'next/server'

import { getResume } from '@/lib/db/queries/resume'
import { createRescoreQueue } from '@/worker/queues'

export async function POST() {
  try {
    const resume = await getResume()
    if (!resume) {
      return NextResponse.json(
        { error: { code: 404, message: 'No resume found' } },
        { status: 404 },
      )
    }

    const queue = createRescoreQueue()
    await queue.add('score.batch', { resumeId: resume.id }, {
      jobId: `rescore-${resume.id}`,
      removeOnComplete: true,
      removeOnFail: false,
    })
    await queue.close()

    return NextResponse.json(
      { data: { status: 'rescoring', resumeId: resume.id } },
      { status: 202 },
    )
  } catch {
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
