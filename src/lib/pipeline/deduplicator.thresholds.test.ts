import { describe, expect, it } from 'vitest'

import { deduplicate } from './deduplicator'
import type { NormalizedJob } from './types'

function createNormalizedJob(overrides?: Partial<NormalizedJob>): NormalizedJob {
  return {
    externalId: `ext-${Math.random().toString(36).slice(2)}`,
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
    country: 'US',
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    searchText: 'Software Engineer Google Build things.',
    sources: [{ name: 'remoteok', external_id: 'ext-123', fetched_at: '2026-03-08T00:00:00Z' }],
    discoveredAt: new Date(),
    pipelineStage: 'discovered',
    ...overrides,
  }
}

// Helper: mock DB that returns no same-source match but a cross-source candidate
function createCrossSourceDb(candidateRecord: Record<string, unknown>) {
  let queryCount = 0
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (n: number) => {
            queryCount++
            // First query: same-source check — return empty (no match)
            if (queryCount === 1) return Promise.resolve([])
            // Second query: cross-source candidates — return the candidate
            return Promise.resolve([candidateRecord])
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  } as unknown as Parameters<typeof deduplicate>[1]
}

// Helper: mock DB that returns no matches at all
function createEmptyDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  } as unknown as Parameters<typeof deduplicate>[1]
}

describe('deduplicator cross-source thresholds', () => {
  describe('new listing (no cross-source match)', () => {
    it('[P1] should classify as new when no candidates exist', async () => {
      const db = createEmptyDb()
      const job = createNormalizedJob()

      const result = await deduplicate([job], db)

      expect(result.new).toHaveLength(1)
      expect(result.updated).toHaveLength(0)
      expect(result.similar).toHaveLength(0)
      expect(result.duplicateCount).toBe(0)
    })
  })

  describe('auto-merge threshold (>0.90)', () => {
    it('[P1] should flag as similar when cross-source match has moderate confidence', async () => {
      const fingerprint = 'test-fingerprint-abc'
      const candidateRecord = {
        id: 'existing-uuid',
        externalId: 'other-ext',
        sourceName: 'jobicy',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: '<p>Build things.</p>',
        descriptionText: 'Build things.',
        salaryMin: null,
        salaryMax: null,
        location: 'New York, NY',
        isRemote: false,
        sourceUrl: 'https://jobicy.com/job/456',
        applyUrl: null,
        benefits: null,
        rawData: {},
        embedding: null,
        sources: [{ name: 'jobicy', external_id: 'other-ext', fetched_at: '2026-03-07T00:00:00Z' }],
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

      const db = createCrossSourceDb(candidateRecord)
      const job = createNormalizedJob({
        externalId: 'remoteok-123',
        sourceName: 'remoteok',
        fingerprint,
        salaryMin: 120000,
        salaryMax: 180000,
      })

      const result = await deduplicate([job], db)

      // Same company + location but different fingerprint → RRF score ~0.79 (similar range)
      // Similar items are added to both result.similar and result.new
      const totalClassified = result.duplicateCount + result.new.length
      expect(totalClassified).toBe(1)
      expect(result.similar).toHaveLength(1)
      expect(result.similar[0].confidence).toBeGreaterThanOrEqual(0.70)
      expect(result.similar[0].confidence).toBeLessThanOrEqual(0.90)
    })
  })

  describe('field-level enrichment on merge', () => {
    it('[P1] should backfill NULL salary on same-source update', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-123',
        sourceName: 'remoteok',
        title: 'Software Engineer',
        company: 'Google',
        descriptionHtml: '<p>Build.</p>',
        descriptionText: 'Build.',
        salaryMin: null,
        salaryMax: null,
        location: 'NYC',
        isRemote: false,
        sourceUrl: 'https://example.com',
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

      const updates: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (u: Record<string, unknown>) => {
            updates.push(u)
            return { where: () => Promise.resolve() }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob({
        externalId: 'ext-123',
        sourceName: 'remoteok',
        salaryMin: 120000,
        salaryMax: 180000,
        applyUrl: 'https://example.com/apply',
      })

      await deduplicate([job], db)

      expect(updates).toHaveLength(1)
      expect(updates[0].salaryMin).toBe(120000)
      expect(updates[0].salaryMax).toBe(180000)
      expect(updates[0].applyUrl).toBe('https://example.com/apply')
    })

    it('[P1] should backfill NULL isRemote on same-source update', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-456',
        sourceName: 'jobicy',
        title: 'Data Scientist',
        company: 'Meta',
        descriptionHtml: null,
        descriptionText: null,
        salaryMin: 150000,
        salaryMax: 200000,
        location: 'Remote',
        isRemote: null,
        sourceUrl: 'https://jobicy.com/job',
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

      const updates: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (u: Record<string, unknown>) => {
            updates.push(u)
            return { where: () => Promise.resolve() }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob({
        externalId: 'ext-456',
        sourceName: 'jobicy',
        isRemote: true,
        descriptionHtml: '<p>Remote data role</p>',
        descriptionText: 'Remote data role',
      })

      await deduplicate([job], db)

      expect(updates).toHaveLength(1)
      expect(updates[0].isRemote).toBe(true)
      expect(updates[0].descriptionHtml).toBe('<p>Remote data role</p>')
      expect(updates[0].descriptionText).toBe('Remote data role')
    })

    it('[P1] should NOT overwrite existing non-NULL values', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'ext-789',
        sourceName: 'remoteok',
        title: 'Engineer',
        company: 'Apple',
        descriptionHtml: '<p>Original</p>',
        descriptionText: 'Original',
        salaryMin: 100000,
        salaryMax: 150000,
        location: 'Cupertino, CA',
        isRemote: false,
        sourceUrl: 'https://example.com',
        applyUrl: 'https://example.com/apply',
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

      const updates: Record<string, unknown>[] = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingRecord]),
            }),
          }),
        }),
        update: () => ({
          set: (u: Record<string, unknown>) => {
            updates.push(u)
            return { where: () => Promise.resolve() }
          },
        }),
      } as unknown as Parameters<typeof deduplicate>[1]

      const job = createNormalizedJob({
        externalId: 'ext-789',
        sourceName: 'remoteok',
        salaryMin: 200000,
        salaryMax: 300000,
        descriptionHtml: '<p>Updated</p>',
        descriptionText: 'Updated',
        location: 'San Francisco, CA',
        isRemote: true,
        applyUrl: 'https://new-apply.com',
      })

      await deduplicate([job], db)

      if (updates.length > 0) {
        // Existing non-NULL fields should NOT be overwritten
        expect(updates[0].salaryMin).toBeUndefined()
        expect(updates[0].salaryMax).toBeUndefined()
        expect(updates[0].descriptionHtml).toBeUndefined()
        expect(updates[0].descriptionText).toBeUndefined()
        expect(updates[0].location).toBeUndefined()
        expect(updates[0].isRemote).toBeUndefined()
        expect(updates[0].applyUrl).toBeUndefined()
        // Protected fields should never be present
        expect(updates[0].discoveredAt).toBeUndefined()
        expect(updates[0].pipelineStage).toBeUndefined()
        expect(updates[0].reviewedAt).toBeUndefined()
        expect(updates[0].appliedAt).toBeUndefined()
      }
    })
  })

  describe('multiple listings batch', () => {
    it('[P1] should handle batch with mix of new and duplicate listings', async () => {
      const existingRecord = {
        id: 'existing-uuid',
        externalId: 'dup-ext',
        sourceName: 'remoteok',
        title: 'Engineer',
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

      let queryCount = 0
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => {
                queryCount++
                // First job: same-source match found
                if (queryCount === 1) return Promise.resolve([existingRecord])
                // Second job: no matches at all
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
        createNormalizedJob({ externalId: 'dup-ext', sourceName: 'remoteok', title: 'Engineer', company: 'Google' }),
        createNormalizedJob({ externalId: 'new-ext', sourceName: 'himalayas', title: 'Designer', company: 'Meta', fingerprint: 'unique-fp' }),
      ]

      const result = await deduplicate(jobs, db)

      expect(result.updated).toHaveLength(1)
      expect(result.new).toHaveLength(1)
      expect(result.duplicateCount).toBe(1)
    })
  })
})
