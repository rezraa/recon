import { describe, expect, it } from 'vitest'

import { deduplicate } from './deduplicator'
import type { NormalizedJob, SourceAttribution } from './types'

function createNormalizedJob(overrides?: Partial<NormalizedJob>): NormalizedJob {
  return {
    externalId: 'ext-123',
    sourceName: 'remoteok',
    title: 'Software Engineer',
    company: 'Google',
    descriptionHtml: '<p>Build things.</p>',
    descriptionText: 'Build things.',
    salaryMin: 120000,
    salaryMax: 180000,
    location: 'New York, NY',
    isRemote: false,
    sourceUrl: 'https://example.com/job/123',
    applyUrl: undefined,
    benefits: undefined,
    rawData: { original: true },
    fingerprint: 'abc123',
    searchText: 'Software Engineer Google Build things.',
    sources: [{ name: 'remoteok', external_id: 'ext-123', fetched_at: '2026-03-08T00:00:00Z' }],
    discoveredAt: new Date(),
    pipelineStage: 'discovered',
    ...overrides,
  }
}

function createMockDb(existingRecords: Record<string, unknown>[] = []) {
  const updatedRecords: { id: string; updates: Record<string, unknown> }[] = []

  const mockWhere = (condition: unknown) => {
    // For same-source detection (sourceName + externalId match)
    // Return matching records based on stored data
    return {
      limit: (_n: number) => {
        // Simple simulation: check if any existing record matches
        // The actual SQL condition is complex, but for testing we match by sourceName + externalId
        return Promise.resolve(existingRecords)
      },
    }
  }

  const mockUpdateWhere = (condition: unknown) => {
    return Promise.resolve()
  }

  const db = {
    select: () => ({
      from: (_table: unknown) => ({
        where: mockWhere,
      }),
    }),
    update: (_table: unknown) => ({
      set: (updates: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updatedRecords.push({ id: 'mock-id', updates })
          return Promise.resolve()
        },
      }),
    }),
    _updatedRecords: updatedRecords,
  }

  return db as unknown as Parameters<typeof deduplicate>[1]
}

describe('deduplicate', () => {
  describe('same-source detection', () => {
    it('[P1] should detect same-source duplicate via sourceName + externalId', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: '<p>Build things.</p>',
        descriptionText: 'Build things.',
        salaryMin: null,
        salaryMax: null,
        location: 'New York, NY',
        isRemote: false,
        sourceUrl: 'https://example.com/job/123',
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [],
        dedupConfidence: null,
        matchScore: null,
        matchBreakdown: null,
        pipelineStage: 'discovered',
        discoveredAt: new Date(),
        reviewedAt: null,
        appliedAt: null,
        stageChangedAt: null,
        isDismissed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        searchVector: null,
      }

      const db = createMockDb([existingRecord])
      const job = createNormalizedJob({ salaryMin: 120000, salaryMax: 180000 })

      const result = await deduplicate([job], db)

      expect(result.updated).toHaveLength(1)
      expect(result.duplicateCount).toBe(1)
      expect(result.new).toHaveLength(0)
    })

    it('[P1] should backfill NULL salary from new data', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: '<p>Build things.</p>',
        descriptionText: 'Build things.',
        salaryMin: null,
        salaryMax: null,
        location: 'New York, NY',
        isRemote: false,
        sourceUrl: 'https://example.com/job/123',
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [],
        dedupConfidence: null,
        matchScore: null,
        matchBreakdown: null,
        pipelineStage: 'discovered',
        discoveredAt: new Date(),
        reviewedAt: null,
        appliedAt: null,
        stageChangedAt: null,
        isDismissed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        searchVector: null,
      }

      const updatedRecords: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (updates: Record<string, unknown>) => {
            updatedRecords.push(updates)
            return {
              where: () => Promise.resolve(),
            }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob({ salaryMin: 120000, salaryMax: 180000 })
      await deduplicate([job], db)

      expect(updatedRecords).toHaveLength(1)
      expect(updatedRecords[0].salaryMin).toBe(120000)
      expect(updatedRecords[0].salaryMax).toBe(180000)
    })

    it('[P1] should NOT overwrite existing non-NULL salary with new value', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: '<p>Build things.</p>',
        descriptionText: 'Build things.',
        salaryMin: 100000,
        salaryMax: 150000,
        location: 'New York, NY',
        isRemote: false,
        sourceUrl: 'https://example.com/job/123',
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [],
        dedupConfidence: null,
        matchScore: null,
        matchBreakdown: null,
        pipelineStage: 'in-progress',
        discoveredAt: new Date(),
        reviewedAt: new Date(),
        appliedAt: null,
        stageChangedAt: null,
        isDismissed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        searchVector: null,
      }

      const updatedRecords: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (updates: Record<string, unknown>) => {
            updatedRecords.push(updates)
            return {
              where: () => Promise.resolve(),
            }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob({ salaryMin: 200000, salaryMax: 300000 })
      await deduplicate([job], db)

      // Should still update (for sources merge) but salary should NOT be overwritten
      if (updatedRecords.length > 0) {
        expect(updatedRecords[0].salaryMin).toBeUndefined()
        expect(updatedRecords[0].salaryMax).toBeUndefined()
      }
    })

    it('[P1] should never overwrite discoveredAt, pipelineStage, reviewedAt, appliedAt', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: null,
        descriptionText: null,
        salaryMin: null,
        salaryMax: null,
        location: null,
        isRemote: null,
        sourceUrl: null,
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [],
        dedupConfidence: null,
        matchScore: null,
        matchBreakdown: null,
        pipelineStage: 'in-progress',
        discoveredAt: new Date('2026-01-01'),
        reviewedAt: new Date('2026-02-01'),
        appliedAt: new Date('2026-03-01'),
        stageChangedAt: null,
        isDismissed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        searchVector: null,
      }

      const updatedRecords: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (updates: Record<string, unknown>) => {
            updatedRecords.push(updates)
            return {
              where: () => Promise.resolve(),
            }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob()
      await deduplicate([job], db)

      if (updatedRecords.length > 0) {
        expect(updatedRecords[0].discoveredAt).toBeUndefined()
        expect(updatedRecords[0].pipelineStage).toBeUndefined()
        expect(updatedRecords[0].reviewedAt).toBeUndefined()
        expect(updatedRecords[0].appliedAt).toBeUndefined()
      }
    })
  })

  describe('new listing detection', () => {
    it('[P1] should classify truly new listings', async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: (_n: number) => Promise.resolve([]),
            }),
          }),
        }),
        update: () => ({
          set: () => ({ where: () => Promise.resolve() }),
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob()
      const result = await deduplicate([job], db)

      expect(result.new).toHaveLength(1)
      expect(result.duplicateCount).toBe(0)
    })
  })

  describe('source attribution', () => {
    it('[P1] should add source to sources array if not already present', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: '<p>Build things.</p>',
        descriptionText: 'Build things.',
        salaryMin: 120000,
        salaryMax: 180000,
        location: 'New York, NY',
        isRemote: false,
        sourceUrl: 'https://example.com/job/123',
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [{ name: 'jobicy', external_id: 'other-456', fetched_at: '2026-03-07T00:00:00Z' }],
        dedupConfidence: null,
        matchScore: null,
        matchBreakdown: null,
        pipelineStage: 'discovered',
        discoveredAt: new Date(),
        reviewedAt: null,
        appliedAt: null,
        stageChangedAt: null,
        isDismissed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        searchVector: null,
      }

      const updatedRecords: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (updates: Record<string, unknown>) => {
            updatedRecords.push(updates)
            return {
              where: () => Promise.resolve(),
            }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob()
      await deduplicate([job], db)

      expect(updatedRecords).toHaveLength(1)
      const sources = updatedRecords[0].sources as SourceAttribution[]
      expect(sources).toHaveLength(2)
      expect(sources[0].name).toBe('jobicy')
      expect(sources[1].name).toBe('remoteok')
    })

    it('[P1] should NOT add duplicate source entry', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: '<p>Build things.</p>',
        descriptionText: 'Build things.',
        salaryMin: 120000,
        salaryMax: 180000,
        location: 'New York, NY',
        isRemote: false,
        sourceUrl: 'https://example.com/job/123',
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [{ name: 'remoteok', external_id: 'ext-123', fetched_at: '2026-03-07T00:00:00Z' }],
        dedupConfidence: null,
        matchScore: null,
        matchBreakdown: null,
        pipelineStage: 'discovered',
        discoveredAt: new Date(),
        reviewedAt: null,
        appliedAt: null,
        stageChangedAt: null,
        isDismissed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        searchVector: null,
      }

      const updatedRecords: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (updates: Record<string, unknown>) => {
            updatedRecords.push(updates)
            return {
              where: () => Promise.resolve(),
            }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob()
      await deduplicate([job], db)

      // Source already exists, so no sources update needed
      // The update should still happen for updatedAt, but sources should not have duplicates
      if (updatedRecords.length > 0 && updatedRecords[0].sources) {
        const sources = updatedRecords[0].sources as SourceAttribution[]
        expect(sources).toHaveLength(1)
      }
    })
  })

  describe('dedup stats', () => {
    it('[P1] should track duplicate count accurately', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: null,
        descriptionText: null,
        salaryMin: null,
        salaryMax: null,
        location: null,
        isRemote: null,
        sourceUrl: null,
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [],
        dedupConfidence: null,
        matchScore: null,
        matchBreakdown: null,
        pipelineStage: 'discovered',
        discoveredAt: new Date(),
        reviewedAt: null,
        appliedAt: null,
        stageChangedAt: null,
        isDismissed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        searchVector: null,
      }

      // Mock: first call returns existing, second call returns empty
      let callCount = 0
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => {
                callCount++
                // First two calls are same-source lookups (one per job)
                if (callCount <= 1) return Promise.resolve([existingRecord])
                return Promise.resolve([])
              },
            }),
          }),
        }),
        update: () => ({
          set: () => ({ where: () => Promise.resolve() }),
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const jobs = [
        createNormalizedJob({ externalId: 'ext-123' }),
        createNormalizedJob({ externalId: 'ext-new', title: 'Data Scientist', fingerprint: 'xyz' }),
      ]

      const result = await deduplicate(jobs, db)

      expect(result.duplicateCount).toBe(1)
      expect(result.updated).toHaveLength(1)
      expect(result.new).toHaveLength(1)
    })
  })
})
