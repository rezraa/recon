import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies before imports
vi.mock('@/lib/ai/embeddings', () => ({
  computeEmbedding: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  jobsTable: {
    id: 'id',
    title: 'title',
    company: 'company',
    descriptionText: 'description_text',
    embedding: 'embedding',
  },
}))

import { computeEmbedding } from '@/lib/ai/embeddings'
import { getDb } from '@/lib/db/client'
import { backfillEmbeddings } from '@/lib/pipeline/backfill-embeddings'

const mockComputeEmbedding = vi.mocked(computeEmbedding)
const mockGetDb = vi.mocked(getDb)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockDb(jobsWithoutEmbeddings: Array<{ id: string; title: string; company: string; descriptionText: string }>) {
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })

  const mockWhere = vi.fn().mockResolvedValue(jobsWithoutEmbeddings)
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

  const db = {
    select: mockSelect,
    update: mockUpdate,
  }

  mockGetDb.mockReturnValue(db as never)
  return { db, mockUpdate, mockSelect }
}

function createTestJob(id: string, title: string, company: string, descriptionText: string) {
  return { id, title, company, descriptionText }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('backfillEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] should return zero counts when no jobs have NULL embeddings', async () => {
    createMockDb([])

    const result = await backfillEmbeddings()

    expect(result).toEqual({ total: 0, updated: 0, errors: 0 })
  })

  it('[P1] should compute embeddings for jobs with NULL embeddings', async () => {
    const jobs = [
      createTestJob('1', 'Software Engineer', 'Acme', 'Build web apps'),
      createTestJob('2', 'Backend Dev', 'Corp', 'API development'),
    ]

    const { mockUpdate } = createMockDb(jobs)

    const fakeEmbedding = new Float32Array(384).fill(0.1)
    mockComputeEmbedding.mockResolvedValue(fakeEmbedding)

    const result = await backfillEmbeddings()

    expect(result.total).toBe(2)
    expect(result.updated).toBe(2)
    expect(result.errors).toBe(0)
    expect(mockComputeEmbedding).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })

  it('[P1] should use correct text format matching embedJobs() pattern', async () => {
    const jobs = [
      createTestJob('1', 'Senior Engineer', 'BigCo', 'Build scalable distributed systems with TypeScript and Node.js'),
    ]

    createMockDb(jobs)

    const fakeEmbedding = new Float32Array(384).fill(0.1)
    mockComputeEmbedding.mockResolvedValue(fakeEmbedding)

    await backfillEmbeddings()

    // Should match: `${title} ${company} ${descriptionText.slice(0, 500)}`
    expect(mockComputeEmbedding).toHaveBeenCalledWith(
      'Senior Engineer BigCo Build scalable distributed systems with TypeScript and Node.js',
    )
  })

  it('[P1] should process jobs in batches of 5', async () => {
    const jobs = Array.from({ length: 12 }, (_, i) =>
      createTestJob(`id-${i}`, `Job ${i}`, `Company ${i}`, `Description ${i}`),
    )

    createMockDb(jobs)

    const fakeEmbedding = new Float32Array(384).fill(0.1)
    mockComputeEmbedding.mockResolvedValue(fakeEmbedding)

    const result = await backfillEmbeddings()

    expect(result.total).toBe(12)
    expect(result.updated).toBe(12)
    expect(mockComputeEmbedding).toHaveBeenCalledTimes(12)
  })

  it('[P1] should handle errors gracefully and continue processing', async () => {
    const jobs = [
      createTestJob('1', 'Job A', 'Co A', 'Desc A'),
      createTestJob('2', 'Job B', 'Co B', 'Desc B'),
      createTestJob('3', 'Job C', 'Co C', 'Desc C'),
    ]

    createMockDb(jobs)

    const fakeEmbedding = new Float32Array(384).fill(0.1)
    mockComputeEmbedding
      .mockResolvedValueOnce(fakeEmbedding)
      .mockRejectedValueOnce(new Error('Model failed'))
      .mockResolvedValueOnce(fakeEmbedding)

    const result = await backfillEmbeddings()

    expect(result.total).toBe(3)
    expect(result.updated).toBe(2)
    expect(result.errors).toBe(1)
  })

  it('[P2] should truncate description to 500 chars', async () => {
    const longDesc = 'x'.repeat(1000)
    const jobs = [createTestJob('1', 'Dev', 'Co', longDesc)]

    createMockDb(jobs)

    const fakeEmbedding = new Float32Array(384).fill(0.1)
    mockComputeEmbedding.mockResolvedValue(fakeEmbedding)

    await backfillEmbeddings()

    const calledWith = mockComputeEmbedding.mock.calls[0][0]
    // title + space + company + space + 500 chars = "Dev Co " + 500 x's
    expect(calledWith.length).toBe(3 + 1 + 2 + 1 + 500)
  })
})
