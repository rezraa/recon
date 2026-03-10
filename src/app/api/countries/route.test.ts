import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockResults: Array<{ code: string | null; count: number }> = []

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: () => ({
            orderBy: () => Promise.resolve(mockResults),
          }),
        }),
      }),
    }),
  })),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { GET } from './route'

describe('GET /api/countries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResults = []
  })

  it('[P1] should return country codes with counts', async () => {
    mockResults = [
      { code: 'US', count: 245 },
      { code: 'IN', count: 18 },
      { code: 'GB', count: 12 },
      { code: 'Unknown', count: 5 },
    ]

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(4)
    expect(body.data[0]).toEqual({ code: 'US', count: 245 })
    expect(body.data[1]).toEqual({ code: 'IN', count: 18 })
  })

  it('[P1] should return empty array when no jobs exist', async () => {
    mockResults = []

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(0)
  })

  it('[P1] should filter out null country codes', async () => {
    mockResults = [
      { code: 'US', count: 100 },
      { code: null, count: 5 },
    ]

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].code).toBe('US')
  })

  it('[P1] should return 500 on database error', async () => {
    const { getDb } = await import('@/lib/db/client')
    vi.mocked(getDb).mockImplementationOnce(() => {
      throw new Error('Connection lost')
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('Failed to fetch countries')
  })
})
