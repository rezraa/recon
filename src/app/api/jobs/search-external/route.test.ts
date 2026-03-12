import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/ai/embeddings', () => ({
  computeEmbedding: vi.fn().mockResolvedValue(new Float32Array(384).fill(0.5)),
}))

const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 'new-1' }])
const mockSelectWhere = vi.fn().mockResolvedValue([]) // cache check: no existing jobs

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: mockSelectWhere,
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: mockInsertReturning,
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/db/queries/resume', () => ({
  getResume: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/db/queries/sources', () => ({
  getSourceApiKey: vi.fn().mockResolvedValue(null),
}))

const mockSearchSearXNG = vi.fn().mockResolvedValue([])
vi.mock('@/lib/adapters/searxng', () => ({
  searchSearXNG: (...args: unknown[]) => mockSearchSearXNG(...args),
}))

const mockSerplyListings = vi.fn().mockResolvedValue([])
vi.mock('@/lib/adapters/serply', () => ({
  serplyAdapter: {
    name: 'serply',
    displayName: 'Serply',
    type: 'key_required',
    fetchListings: (...args: unknown[]) => mockSerplyListings(...args),
  },
}))

vi.mock('@/lib/pipeline/normalizer', () => ({
  normalize: vi.fn().mockResolvedValue({ normalized: [], skippedCount: 0 }),
}))

vi.mock('@/lib/pipeline/scoring', () => ({
  extractResumeProfile: vi.fn().mockResolvedValue({
    title: 'SWE', domain: 'Tech', seniorityLevel: 'senior',
    yearsExperience: 5, hardSkills: ['React'], softSkills: [], certifications: [],
  }),
  embedProfile: vi.fn().mockResolvedValue({
    hardSkills: new Float32Array(384),
    title: new Float32Array(384),
  }),
  scorePartialJob: vi.fn().mockResolvedValue({
    matchScore: 35,
    matchBreakdown: { skills: { score: 0 }, experience: { score: 50 }, salary: { score: 0 }, domainMultiplier: 70 },
  }),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { POST } from './route'

function createRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/jobs/search-external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/jobs/search-external', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 400 for empty query', async () => {
    const response = await POST(createRequest({ query: '' }))
    expect(response.status).toBe(400)
  })

  it('should return found=0 when SearXNG returns no listings', async () => {
    mockSearchSearXNG.mockResolvedValueOnce([])
    const response = await POST(createRequest({ query: 'SDET' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.found).toBe(0)
  })

  it('should call SearXNG adapter with query', async () => {
    mockSearchSearXNG.mockResolvedValueOnce([
      {
        source_name: 'linkedin',
        external_id: 'searxng-li-123',
        title: 'SDET',
        company: 'Netflix',
        source_url: 'https://linkedin.com/jobs/view/123',
        description_text: 'Test role',
        raw_data: {},
      },
    ])

    const { normalize } = await import('@/lib/pipeline/normalizer')
    vi.mocked(normalize).mockResolvedValueOnce({
      normalized: [{
        externalId: 'searxng-li-123',
        sourceName: 'linkedin',
        title: 'SDET',
        company: 'Netflix',
        descriptionText: 'Test role',
        searchText: 'SDET Netflix Test role',
        sources: [],
        discoveredAt: new Date(),
        pipelineStage: 'discovered',
        country: 'US',
        fingerprint: 'abc',
      }] as never,
      skippedCount: 0,
    })

    const response = await POST(createRequest({ query: 'SDET' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockSearchSearXNG).toHaveBeenCalledWith('SDET remote', {
      maxPages: 3,
      timeRange: 'week',
    })
    expect(body.data.found).toBe(1)
  })

  it('should call Serply adapter when SERPLY_API_KEY configured', async () => {
    const { getSourceApiKey } = await import('@/lib/db/queries/sources')
    vi.mocked(getSourceApiKey).mockResolvedValueOnce('test-serply-key')

    mockSerplyListings.mockResolvedValueOnce([
      {
        source_name: 'serply',
        external_id: 'sp-1',
        title: 'SDET',
        company: 'Google',
        source_url: 'https://google.com/jobs/1',
        description_text: 'Quality engineer',
        raw_data: {},
      },
    ])

    const { normalize } = await import('@/lib/pipeline/normalizer')
    vi.mocked(normalize).mockResolvedValueOnce({
      normalized: [{
        externalId: 'sp-1',
        sourceName: 'serply',
        title: 'SDET',
        company: 'Google',
        descriptionText: 'Quality engineer',
        searchText: 'SDET Google Quality engineer',
        sources: [],
        discoveredAt: new Date(),
        pipelineStage: 'discovered',
        country: 'US',
        fingerprint: 'def',
      }] as never,
      skippedCount: 0,
    })

    const response = await POST(createRequest({ query: 'SDET' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockSerplyListings).toHaveBeenCalled()
    expect(body.data.found).toBe(1)
  })

  it('should return found count of inserted jobs', async () => {
    mockSearchSearXNG.mockResolvedValueOnce([
      { source_name: 'linkedin', external_id: 'searxng-li-1', title: 'Dev', company: 'Co', source_url: 'https://linkedin.com/jobs/view/1', description_text: 'Test', raw_data: {} },
      { source_name: 'linkedin', external_id: 'searxng-li-2', title: 'QA', company: 'Co2', source_url: 'https://linkedin.com/jobs/view/2', description_text: 'Test2', raw_data: {} },
    ])

    const { normalize } = await import('@/lib/pipeline/normalizer')
    vi.mocked(normalize).mockResolvedValueOnce({
      normalized: [
        { externalId: 'searxng-li-1', sourceName: 'linkedin', title: 'Dev', company: 'Co', descriptionText: 'Test', searchText: 'Dev Co Test', sources: [], discoveredAt: new Date(), pipelineStage: 'discovered', country: 'US', fingerprint: 'a' },
        { externalId: 'searxng-li-2', sourceName: 'linkedin', title: 'QA', company: 'Co2', descriptionText: 'Test2', searchText: 'QA Co2 Test2', sources: [], discoveredAt: new Date(), pipelineStage: 'discovered', country: 'US', fingerprint: 'b' },
      ] as never,
      skippedCount: 0,
    })

    const response = await POST(createRequest({ query: 'engineer' }))
    const body = await response.json()

    expect(body.data.found).toBe(2)
  })

  it('should handle SearXNG failure gracefully', async () => {
    mockSearchSearXNG.mockRejectedValueOnce(new Error('SearXNG down'))
    const response = await POST(createRequest({ query: 'SDET' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.found).toBe(0)
  })
})
