import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  jobsTable: {
    id: 'id',
    location: 'location',
    country: 'country',
  },
}))

import { getDb } from '@/lib/db/client'

import { backfillCountry } from './backfill-country'

const mockGetDb = vi.mocked(getDb)

function createMockDb(batches: Array<Array<{ id: string; location: string | null }>>) {
  let batchIndex = 0

  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })

  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => {
          const batch = batches[batchIndex] ?? []
          batchIndex++
          return Promise.resolve(batch)
        }),
      }),
    }),
  })

  const db = { select: mockSelect, update: mockUpdate }
  mockGetDb.mockReturnValue(db as never)
  return { db, mockUpdate }
}

describe('backfillCountry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] should return zero when no jobs have NULL country', async () => {
    createMockDb([[]])

    const result = await backfillCountry()

    expect(result.updated).toBe(0)
  })

  it('[P1] should backfill country for jobs with NULL country', async () => {
    const jobs = [
      { id: '1', location: 'San Francisco, CA' },
      { id: '2', location: 'Bangalore, India' },
      { id: '3', location: null },
    ]

    const { mockUpdate } = createMockDb([jobs, []])

    const result = await backfillCountry()

    expect(result.updated).toBe(3)
    expect(mockUpdate).toHaveBeenCalledTimes(3)
  })

  it('[P1] should be idempotent — only processes NULL country jobs', async () => {
    const { mockUpdate } = createMockDb([
      [{ id: '1', location: 'Remote' }, { id: '2', location: 'London, UK' }],
      [],
    ])

    const result = await backfillCountry()

    expect(result.updated).toBe(2)
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })

  it('[P1] should process in batches', async () => {
    const batch1 = Array.from({ length: 3 }, (_, i) => ({
      id: `id-${i}`,
      location: 'New York, NY',
    }))
    const batch2 = Array.from({ length: 2 }, (_, i) => ({
      id: `id-${i + 3}`,
      location: 'Remote',
    }))

    const { mockUpdate } = createMockDb([batch1, batch2, []])

    const result = await backfillCountry()

    expect(result.updated).toBe(5)
    expect(mockUpdate).toHaveBeenCalledTimes(5)
  })
})
