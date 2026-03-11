import { NextRequest } from 'next/server'
import { beforeEach,describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockRunResult: unknown[] = []

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockRunResult),
        }),
      }),
    }),
  })),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { GET } from './route'

function createRequest(runId?: string): NextRequest {
  const url = runId
    ? `http://localhost:3000/api/discovery/status?runId=${runId}`
    : 'http://localhost:3000/api/discovery/status'
  return new NextRequest(url)
}

describe('GET /api/discovery/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunResult = []
  })

  it('[P1] should return fetching status while sources being checked', async () => {
    mockRunResult = [{
      id: 'run-123',
      startedAt: new Date(), // recent — not stale
      completedAt: null,
      sourcesAttempted: 3,
      sourcesSucceeded: 1,
      sourcesFailed: 0,
      listingsFetched: 50,
      listingsNew: 30,
      listingsDeduplicated: 5,
      errors: null,
    }]

    const response = await GET(createRequest('run-123'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('fetching')
    expect(body.data.sources_completed).toBe(1)
    expect(body.data.sources_total).toBe(3)
    expect(body.data.listings_new).toBe(30)
  })

  it('[P1] should return scoring status when all sources done but not completed', async () => {
    mockRunResult = [{
      id: 'run-123',
      startedAt: new Date(), // recent — not stale
      completedAt: null,
      sourcesAttempted: 3,
      sourcesSucceeded: 2,
      sourcesFailed: 1,
      listingsFetched: 80,
      listingsNew: 50,
      listingsDeduplicated: 5,
      errors: null,
    }]

    const response = await GET(createRequest('run-123'))
    const body = await response.json()

    expect(body.data.status).toBe('scoring')
  })

  it('[P1] should treat stale runs as completed', async () => {
    mockRunResult = [{
      id: 'run-123',
      startedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago — stale
      completedAt: null,
      sourcesAttempted: 3,
      sourcesSucceeded: 1,
      sourcesFailed: 0,
      listingsFetched: 50,
      listingsNew: 30,
      listingsDeduplicated: 5,
      errors: null,
    }]

    const response = await GET(createRequest('run-123'))
    const body = await response.json()

    expect(body.data.status).toBe('completed')
  })

  it('[P1] should return completed status when done', async () => {
    mockRunResult = [{
      id: 'run-123',
      startedAt: new Date('2026-03-09T10:00:00Z'),
      completedAt: new Date('2026-03-09T10:05:00Z'),
      sourcesAttempted: 3,
      sourcesSucceeded: 3,
      sourcesFailed: 0,
      listingsFetched: 100,
      listingsNew: 75,
      listingsDeduplicated: 10,
      errors: null,
    }]

    const response = await GET(createRequest('run-123'))
    const body = await response.json()

    expect(body.data.status).toBe('completed')
  })

  it('[P1] should return completed status with partial source errors', async () => {
    mockRunResult = [{
      id: 'run-123',
      startedAt: new Date('2026-03-09T10:00:00Z'),
      completedAt: new Date('2026-03-09T10:05:00Z'),
      sourcesAttempted: 3,
      sourcesSucceeded: 2,
      sourcesFailed: 1,
      listingsFetched: 80,
      listingsNew: 50,
      listingsDeduplicated: 5,
      errors: [{ source: 'serply', error: 'API key invalid', timestamp: '2026-03-09T10:03:00Z' }],
    }]

    const response = await GET(createRequest('run-123'))
    const body = await response.json()

    // Partial failure (2/3 sources succeeded) = completed, not failed
    expect(body.data.status).toBe('completed')
  })

  it('[P1] should return failed status when ALL sources failed', async () => {
    mockRunResult = [{
      id: 'run-123',
      startedAt: new Date('2026-03-09T10:00:00Z'),
      completedAt: new Date('2026-03-09T10:05:00Z'),
      sourcesAttempted: 3,
      sourcesSucceeded: 0,
      sourcesFailed: 3,
      listingsFetched: 0,
      listingsNew: 0,
      listingsDeduplicated: 0,
      errors: [
        { source: 'himalayas', error: 'Timeout', timestamp: '2026-03-09T10:01:00Z' },
        { source: 'himalayas', error: 'API down', timestamp: '2026-03-09T10:02:00Z' },
        { source: 'serply', error: 'Invalid key', timestamp: '2026-03-09T10:03:00Z' },
      ],
    }]

    const response = await GET(createRequest('run-123'))
    const body = await response.json()

    expect(body.data.status).toBe('failed')
  })

  it('[P1] should return 404 for unknown runId', async () => {
    mockRunResult = []

    const response = await GET(createRequest('nonexistent-id'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Pipeline run not found')
  })

  it('[P1] should return 400 when runId is missing', async () => {
    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('runId query parameter is required')
  })
})
