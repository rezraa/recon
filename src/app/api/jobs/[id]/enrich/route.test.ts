import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/worker/queues', () => ({
  createEnrichQueue: vi.fn(),
}))

import { createEnrichQueue } from '@/worker/queues'

import { POST } from './route'

const mockCreateEnrichQueue = vi.mocked(createEnrichQueue)

function createMockQueue() {
  const queue = {
    add: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
  mockCreateEnrichQueue.mockReturnValue(queue as never)
  return queue
}

function createRequest(id: string) {
  return [
    new Request('http://localhost/api/jobs/' + id + '/enrich', { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  ] as const
}

describe('POST /api/jobs/[id]/enrich', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('[P1] should enqueue enrichment job and return 202', async () => {
    const queue = createMockQueue()
    const [req, ctx] = createRequest('job-123')

    const res = await POST(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(body.data.status).toBe('enqueued')
    expect(body.data.jobId).toBe('job-123')

    expect(queue.add).toHaveBeenCalledWith(
      'enrich.job',
      { jobId: 'job-123' },
      expect.objectContaining({
        jobId: 'enrich-job-123',
        removeOnComplete: true,
        removeOnFail: false,
      }),
    )
  })

  it('[P1] should close queue after enqueuing', async () => {
    const queue = createMockQueue()
    const [req, ctx] = createRequest('job-456')

    await POST(req, ctx)

    expect(queue.close).toHaveBeenCalled()
  })

  it('[P2] should return 500 on queue error', async () => {
    mockCreateEnrichQueue.mockImplementation(() => {
      throw new Error('Redis unavailable')
    })

    const [req, ctx] = createRequest('job-789')
    const res = await POST(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error.code).toBe(500)
  })
})
