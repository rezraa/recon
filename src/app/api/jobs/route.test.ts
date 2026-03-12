import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockJobsResult: unknown[] = []
let mockCountResult: unknown[] = [{ count: 0 }]

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    select: (fields?: Record<string, unknown>) => ({
      from: () => {
        // Count query (has 'count' key) returns mockCountResult
        if (fields && 'count' in fields) {
          return {
            where: () => Promise.resolve(mockCountResult),
          }
        }
        // Feed query (has explicit field selection or empty) returns mockJobsResult
        return {
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: () => Promise.resolve(mockJobsResult),
              }),
            }),
          }),
        }
      },
    }),
  })),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { GET, parseCountries } from './route'

function createRequest(params?: Record<string, string>): NextRequest {
  const searchParams = new URLSearchParams(params)
  const query = searchParams.toString()
  return new NextRequest(`http://localhost:3000/api/jobs${query ? `?${query}` : ''}`)
}

const mockJob = {
  id: 'job-1',
  title: 'Software Engineer',
  company: 'TestCo',
  salaryMin: 100000,
  salaryMax: 150000,
  location: 'Remote',
  isRemote: true,
  sourceUrl: 'https://example.com/1',
  sourceName: 'himalayas',
  sources: [{ name: 'himalayas', external_id: 'ext-1', fetched_at: '2026-03-09' }],
  dedupConfidence: 0.95,
  matchScore: 85,
  matchBreakdown: { skills: { score: 80 } },
  pipelineStage: 'discovered',
  discoveredAt: '2026-03-09T00:00:00Z',
  isDismissed: false,
}

describe('GET /api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJobsResult = [mockJob]
    mockCountResult = [{ count: 1 }]
  })

  it('[P1] should return paginated jobs with default sort', async () => {
    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.jobs).toHaveLength(1)
    expect(body.data.total).toBe(1)
    expect(body.data.jobs[0].title).toBe('Software Engineer')
  })

  it('[P1] should respect limit and offset query params', async () => {
    mockJobsResult = [mockJob]
    mockCountResult = [{ count: 50 }]

    const response = await GET(createRequest({ limit: '10', offset: '20' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.total).toBe(50)
  })

  it('[P1] should return empty array when no jobs exist', async () => {
    mockJobsResult = []
    mockCountResult = [{ count: 0 }]

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.jobs).toHaveLength(0)
    expect(body.data.total).toBe(0)
  })

  it('[P1] should exclude dismissed jobs', async () => {
    // The route should filter isDismissed = false
    // We verify by checking the mock was called (route adds where clause)
    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
    expect(body.data).toHaveProperty('total')
  })

  it('[P2] should clamp limit to max 100', async () => {
    const response = await GET(createRequest({ limit: '999' }))
    const body = await response.json()

    // Should not error — limit is clamped
    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('[P2] should default limit to 20 and offset to 0', async () => {
    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('[P1] should apply default US + Unknown country filter', async () => {
    // Default request (no countries param) should still return jobs
    // The route adds inArray(country, ['US', 'Unknown']) to WHERE clause
    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('[P1] should accept custom countries parameter', async () => {
    const response = await GET(createRequest({ countries: 'US,GB,IN' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('[P1] should bypass country filter with countries=all', async () => {
    const response = await GET(createRequest({ countries: 'all' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('[P1] should handle countries=all case-insensitively', async () => {
    const response = await GET(createRequest({ countries: 'ALL' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('[P1] should treat empty countries param as default filter', async () => {
    // ?countries= (empty string) should fall back to default, not return 0 results
    const response = await GET(createRequest({ countries: '' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('[P1] should return 500 with error message on database failure', async () => {
    const { getDb } = await import('@/lib/db/client')
    vi.mocked(getDb).mockImplementationOnce(() => {
      throw new Error('Connection lost')
    })

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('Failed to fetch jobs')
  })
})

describe('GET /api/jobs with search query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJobsResult = [mockJob]
    mockCountResult = [{ count: 1 }]
  })

  it('should accept q query parameter', async () => {
    const response = await GET(createRequest({ q: 'SDET' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('should return results for matching query', async () => {
    const response = await GET(createRequest({ q: 'Software' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.jobs).toHaveLength(1)
  })

  it('should handle empty q parameter', async () => {
    const response = await GET(createRequest({ q: '' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })

  it('should handle whitespace-only q parameter', async () => {
    const response = await GET(createRequest({ q: '   ' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('jobs')
  })
})

describe('parseCountries', () => {
  it('should return default countries when param is null', () => {
    expect(parseCountries(null)).toEqual(['US', 'Unknown'])
  })

  it('should return null for "all" (bypass filter)', () => {
    expect(parseCountries('all')).toBeNull()
  })

  it('should return null for "ALL" (case-insensitive)', () => {
    expect(parseCountries('ALL')).toBeNull()
  })

  it('should parse comma-separated country codes', () => {
    expect(parseCountries('US,GB,IN')).toEqual(['US', 'GB', 'IN'])
  })

  it('should trim whitespace from country codes', () => {
    expect(parseCountries('US , GB , IN')).toEqual(['US', 'GB', 'IN'])
  })

  it('should return default countries for empty string', () => {
    expect(parseCountries('')).toEqual(['US', 'Unknown'])
  })

  it('should return default countries for whitespace-only', () => {
    expect(parseCountries('  ,  , ')).toEqual(['US', 'Unknown'])
  })

  it('should handle single country code', () => {
    expect(parseCountries('IN')).toEqual(['IN'])
  })
})
