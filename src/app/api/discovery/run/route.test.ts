import { beforeEach,describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockQueueAdd = vi.fn().mockResolvedValue({})
const mockQueueClose = vi.fn().mockResolvedValue(undefined)

vi.mock('@/worker/queues', () => ({
  createDiscoveryQueue: vi.fn(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
}))

const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 'run-uuid-123' }])
const mockSelectResult: unknown[] = []

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => Promise.resolve(mockSelectResult),
    }),
    insert: () => ({
      values: () => ({
        returning: () => mockInsertReturning(),
      }),
    }),
  })),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { POST } from './route'

describe('POST /api/discovery/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectResult.length = 0
  })

  it('[P1] should create pipeline_run and enqueue job', async () => {
    mockSelectResult.push(
      { id: 'src-1', name: 'remoteok', isEnabled: true },
      { id: 'src-2', name: 'himalayas', isEnabled: true },
    )

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.data.runId).toBe('run-uuid-123')
    expect(body.data.status).toBe('running')

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'pipeline.run',
      { runId: 'run-uuid-123', sourceNames: ['remoteok', 'himalayas'] },
      { removeOnComplete: true, removeOnFail: false },
    )
  })

  it('[P1] should return 202 with runId', async () => {
    mockSelectResult.push({ id: 'src-1', name: 'remoteok', isEnabled: true })

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.data).toHaveProperty('runId')
    expect(body.data).toHaveProperty('status')
  })

  it('[P1] should return 400 when no sources are enabled', async () => {
    // No enabled sources
    mockSelectResult.push({ id: 'src-1', name: 'remoteok', isEnabled: false })

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('No enabled sources configured')
  })
})
