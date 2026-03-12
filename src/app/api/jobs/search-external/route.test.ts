import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/ai/embeddings', () => ({
  computeEmbedding: vi.fn().mockResolvedValue(new Float32Array(384).fill(0.5)),
}))

const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 'new-1' }])

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: mockInsertReturning,
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/db/queries/sources', () => ({
  getSourceApiKey: vi.fn().mockResolvedValue(null),
}))

const mockRssListings = vi.fn().mockResolvedValue([])
vi.mock('@/lib/adapters/rss', () => ({
  rssAdapter: {
    name: 'rss',
    displayName: 'RSS Feeds',
    type: 'open',
    fetchListings: (...args: unknown[]) => mockRssListings(...args),
  },
  setFeedUrls: vi.fn(),
  getFeedUrls: vi.fn().mockReturnValue([]),
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
    delete process.env.RSSHUB_URL
  })

  it('should return 400 for empty query', async () => {
    const response = await POST(createRequest({ query: '' }))
    expect(response.status).toBe(400)
  })

  it('should return found=0 when no sources configured', async () => {
    const response = await POST(createRequest({ query: 'SDET' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.found).toBe(0)
  })

  it('should call LinkedIn adapter when RSSHUB_URL configured', async () => {
    process.env.RSSHUB_URL = 'http://localhost:1200'
    mockRssListings.mockResolvedValueOnce([
      {
        source_name: 'rss',
        external_id: 'li-1',
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
        externalId: 'li-1',
        sourceName: 'rss',
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
    expect(mockRssListings).toHaveBeenCalled()
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

  it('should skip LinkedIn when RSSHUB_URL not configured', async () => {
    const response = await POST(createRequest({ query: 'SDET' }))
    await response.json()

    expect(mockRssListings).not.toHaveBeenCalled()
  })

  it('should return found count of inserted jobs', async () => {
    process.env.RSSHUB_URL = 'http://localhost:1200'
    mockRssListings.mockResolvedValueOnce([
      { source_name: 'rss', external_id: 'li-1', title: 'Dev', company: 'Co', source_url: 'https://example.com', description_text: 'Test', raw_data: {} },
      { source_name: 'rss', external_id: 'li-2', title: 'QA', company: 'Co2', source_url: 'https://example.com/2', description_text: 'Test2', raw_data: {} },
    ])

    const { normalize } = await import('@/lib/pipeline/normalizer')
    vi.mocked(normalize).mockResolvedValueOnce({
      normalized: [
        { externalId: 'li-1', sourceName: 'rss', title: 'Dev', company: 'Co', descriptionText: 'Test', searchText: 'Dev Co Test', sources: [], discoveredAt: new Date(), pipelineStage: 'discovered', country: 'US', fingerprint: 'a' },
        { externalId: 'li-2', sourceName: 'rss', title: 'QA', company: 'Co2', descriptionText: 'Test2', searchText: 'QA Co2 Test2', sources: [], discoveredAt: new Date(), pipelineStage: 'discovered', country: 'US', fingerprint: 'b' },
      ] as never,
      skippedCount: 0,
    })

    const response = await POST(createRequest({ query: 'engineer' }))
    const body = await response.json()

    expect(body.data.found).toBe(2)
  })
})
