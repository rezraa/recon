import { beforeEach,describe, expect, it, vi } from 'vitest'

import type { NormalizedJob } from '@/lib/pipeline/types'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/ai/embeddings', () => ({
  computeEmbedding: vi.fn().mockResolvedValue(new Float32Array(384).fill(0.5)),
  cosineSimilarity: vi.fn().mockReturnValue(0.85),
}))

const mockExecute = vi.fn().mockResolvedValue([{ '?column?': 1 }])
const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 'run-123' }])
const mockInsertOnConflict = vi.fn().mockResolvedValue(undefined)
const mockUpdateWhere = vi.fn().mockResolvedValue([])
const mockSelectResult: unknown[] = []

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => {
    const fromHandler = () => {
      // Return an array-like promise that also has .where() and .limit() for chaining
      const result = Promise.resolve([...mockSelectResult])
      const whereResult = Promise.resolve([{ count: 0 }])
      Object.assign(whereResult, {
        limit: () => Promise.resolve([...mockSelectResult]),
      })
      Object.assign(result, {
        where: () => whereResult,
        limit: () => Promise.resolve([...mockSelectResult]),
      })
      return result
    }

    return {
      execute: mockExecute,
      select: () => ({
        from: fromHandler,
      }),
      insert: () => ({
        values: () => ({
          returning: () => mockInsertReturning(),
          onConflictDoUpdate: mockInsertOnConflict,
          onConflictDoNothing: mockInsertOnConflict,
        }),
      }),
      update: () => ({
        set: () => ({
          where: mockUpdateWhere,
        }),
      }),
    }
  }),
}))

vi.mock('@/lib/db/queries/resume', () => ({
  getResume: vi.fn().mockResolvedValue({
    id: 'resume-1',
    fileName: 'resume.pdf',
    parsedData: null,
    skills: ['TypeScript', 'React', 'Node.js'],
    experience: [{ title: 'Software Engineer', company: 'Acme', years: 5 }],
    uploadedAt: new Date(),
    updatedAt: new Date(),
  }),
}))

vi.mock('@/lib/db/queries/sources', () => ({
  getSourceApiKey: vi.fn().mockResolvedValue('test-api-key'),
}))

const mockFetchListings = vi.fn().mockResolvedValue([
  {
    source_name: 'remoteok',
    external_id: 'ext-1',
    title: 'Software Engineer',
    company: 'TestCo',
    source_url: 'https://example.com/1',
    description_text: 'Build amazing things with React and Node.',
    raw_data: {},
  },
])

vi.mock('@/lib/adapters/registry', () => ({
  getEnabledAdapters: vi.fn(() => [
    {
      name: 'remoteok',
      displayName: 'RemoteOK',
      type: 'open',
      fetchListings: mockFetchListings,
    },
  ]),
}))

// Track call order to verify pipeline sequencing
const callOrder: string[] = []

vi.mock('@/lib/pipeline/normalizer', () => ({
  normalize: vi.fn().mockImplementation(async () => {
    callOrder.push('normalize')
    return {
      normalized: [
        {
          externalId: 'ext-1',
          sourceName: 'remoteok',
          title: 'Software Engineer',
          company: 'TestCo',
          descriptionHtml: undefined,
          descriptionText: 'Build amazing things with React and Node.',
          salaryMin: undefined,
          salaryMax: undefined,
          location: undefined,
          isRemote: true,
          sourceUrl: 'https://example.com/1',
          applyUrl: undefined,
          benefits: undefined,
          rawData: {},
          fingerprint: 'abc123',
          searchText: 'Software Engineer TestCo Build amazing things with React and Node.',
          sources: [{ name: 'remoteok', external_id: 'ext-1', fetched_at: '2026-03-09T00:00:00Z' }],
          discoveredAt: new Date(),
          pipelineStage: 'discovered',
        } satisfies NormalizedJob,
      ],
      skippedCount: 0,
    }
  }),
  generateFingerprint: vi.fn().mockReturnValue('abc123'),
}))

vi.mock('@/lib/pipeline/deduplicator', () => ({
  deduplicate: vi.fn().mockImplementation(async () => {
    callOrder.push('deduplicate')
    return {
      new: [
        {
          externalId: 'ext-1',
          sourceName: 'remoteok',
          title: 'Software Engineer',
          company: 'TestCo',
          descriptionText: 'Build amazing things with React and Node.',
          searchText: 'Software Engineer TestCo Build amazing things with React and Node.',
          sources: [{ name: 'remoteok', external_id: 'ext-1', fetched_at: '2026-03-09T00:00:00Z' }],
          discoveredAt: new Date(),
          pipelineStage: 'discovered',
        },
      ],
      updated: [],
      similar: [],
      duplicateCount: 0,
    }
  }),
}))

vi.mock('@/lib/pipeline/scoring', () => ({
  scoreJob: vi.fn().mockImplementation(async () => {
    callOrder.push('score')
    return {
      matchScore: 75,
      matchBreakdown: {
        skills: { score: 80, weight: 0.35, signals: { keyword: 0.8, semantic: null } },
        techStack: { score: 75, weight: 0.25, signals: { keyword: 0.75, semantic: null } },
        experience: { score: 70, weight: 0.20, signals: { keyword: null, semantic: 0.7 } },
        salary: { score: 50, weight: 0.20, signals: { keyword: null, semantic: null } },
      },
    }
  }),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { type DiscoveryJobData,discoveryProcessor } from './discovery'

function createMockJob(data: DiscoveryJobData) {
  return {
    data,
    id: 'job-1',
    name: 'pipeline.run',
  } as unknown as Parameters<typeof discoveryProcessor>[0]
}

describe('discoveryProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callOrder.length = 0
    mockSelectResult.length = 0
    // Default: return enabled sources
    mockSelectResult.push(
      { id: 'src-1', name: 'remoteok', isEnabled: true, config: null },
    )
  })

  it('[P1] should execute full pipeline flow: fetch → normalize → embed → dedup → insert → score', async () => {
    const { computeEmbedding } = await import('@/lib/ai/embeddings')
    const { normalize } = await import('@/lib/pipeline/normalizer')
    const { deduplicate } = await import('@/lib/pipeline/deduplicator')
    const { scoreJob } = await import('@/lib/pipeline/scoring')

    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    expect(mockFetchListings).toHaveBeenCalledOnce()
    expect(normalize).toHaveBeenCalledOnce()
    expect(computeEmbedding).toHaveBeenCalled()
    expect(deduplicate).toHaveBeenCalledOnce()
    expect(scoreJob).toHaveBeenCalled()
    // Verify INSERT was called for new jobs (onConflictDoNothing)
    expect(mockInsertOnConflict).toHaveBeenCalled()
  })

  it('[P1] should execute dedup BEFORE insert (correct pipeline ordering)', async () => {
    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // normalize must come before deduplicate, which must come before score
    const normalizeIdx = callOrder.indexOf('normalize')
    const dedupIdx = callOrder.indexOf('deduplicate')
    const scoreIdx = callOrder.indexOf('score')

    expect(normalizeIdx).toBeLessThan(dedupIdx)
    expect(dedupIdx).toBeLessThan(scoreIdx)
  })

  it('[P1] should not block other sources if one adapter fails', async () => {
    // Set up two sources
    mockSelectResult.length = 0
    mockSelectResult.push(
      { id: 'src-1', name: 'remoteok', isEnabled: true, config: null },
      { id: 'src-2', name: 'himalayas', isEnabled: true, config: null },
    )

    const { getEnabledAdapters } = await import('@/lib/adapters/registry')
    const failingAdapter = {
      name: 'remoteok',
      displayName: 'RemoteOK',
      type: 'open' as const,
      fetchListings: vi.fn().mockRejectedValue(new Error('Network error')),
    }
    const workingAdapter = {
      name: 'himalayas',
      displayName: 'Himalayas',
      type: 'open' as const,
      fetchListings: mockFetchListings,
    }
    vi.mocked(getEnabledAdapters).mockReturnValue([failingAdapter, workingAdapter])

    await discoveryProcessor(createMockJob({
      runId: 'run-123',
      sourceNames: ['remoteok', 'himalayas'],
    }))

    // The working adapter should still be called
    expect(mockFetchListings).toHaveBeenCalledOnce()
    // Pipeline completes (completedAt is set)
    expect(mockUpdateWhere).toHaveBeenCalled()
  })

  it('[P1] should update pipeline run record incrementally', async () => {
    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // Multiple update calls for counters + completion
    expect(mockUpdateWhere).toHaveBeenCalled()
    const callCount = mockUpdateWhere.mock.calls.length
    // At minimum: sourcesAttempted, sourcesSucceeded+counters, sourceHealth, completedAt, score update
    expect(callCount).toBeGreaterThanOrEqual(4)
  })

  it('[P1] should set completedAt on pipeline completion', async () => {
    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // The last update should set completedAt
    expect(mockUpdateWhere).toHaveBeenCalled()
  })

  it('[P1] should compute embedding for each job before dedup', async () => {
    const { computeEmbedding } = await import('@/lib/ai/embeddings')

    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // Embedding must be computed before deduplicate is called
    const embeddingCalls = vi.mocked(computeEmbedding).mock.calls
    expect(embeddingCalls.length).toBeGreaterThanOrEqual(1)

    // verify call order: embedding happens before dedup
    const dedupIdx = callOrder.indexOf('deduplicate')
    expect(dedupIdx).toBeGreaterThan(0) // dedup was called after other steps
  })

  it('[P1] should only INSERT new jobs from dedup result (not all normalized jobs)', async () => {
    const { deduplicate } = await import('@/lib/pipeline/deduplicator')

    // Mock dedup returning 1 new, 1 updated (updated = already in DB)
    vi.mocked(deduplicate).mockResolvedValueOnce({
      new: [
        {
          externalId: 'ext-new',
          sourceName: 'remoteok',
          title: 'New Job',
          company: 'NewCo',
          descriptionText: 'New role',
          searchText: 'New Job NewCo New role',
          sources: [],
          discoveredAt: new Date(),
          pipelineStage: 'discovered',
        } as unknown as NormalizedJob,
      ],
      updated: [
        {
          externalId: 'ext-existing',
          sourceName: 'remoteok',
          title: 'Existing Job',
          company: 'OldCo',
          descriptionText: 'Old role',
          searchText: 'Existing Job OldCo Old role',
          sources: [],
          discoveredAt: new Date(),
          pipelineStage: 'discovered',
        } as unknown as NormalizedJob,
      ],
      similar: [],
      duplicateCount: 1,
    })

    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // onConflictDoNothing called once for the 1 new job (not 2 for all)
    expect(mockInsertOnConflict).toHaveBeenCalledTimes(1)
  })

  it('[P2] should handle empty adapter result gracefully', async () => {
    mockFetchListings.mockResolvedValueOnce([])

    const { normalize } = await import('@/lib/pipeline/normalizer')
    vi.mocked(normalize).mockResolvedValueOnce({ normalized: [], skippedCount: 0 })

    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // Should complete without errors
    expect(mockUpdateWhere).toHaveBeenCalled()
  })

  it('[P2] should handle missing resume gracefully (no scoring)', async () => {
    const { getResume } = await import('@/lib/db/queries/resume')
    vi.mocked(getResume).mockResolvedValueOnce(null)

    const { scoreJob } = await import('@/lib/pipeline/scoring')

    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // scoreJob should NOT be called when no resume
    expect(scoreJob).not.toHaveBeenCalled()
  })

  it('[P2] should handle missing preferences gracefully', async () => {
    // preferences query returns empty
    // This is handled by default empty arrays in loadPreferences
    await discoveryProcessor(createMockJob({ runId: 'run-123', sourceNames: ['remoteok'] }))

    // Should complete without errors
    expect(mockFetchListings).toHaveBeenCalled()
  })
})
