import { describe, expect, it, vi } from 'vitest'

import type { RawJobListing } from '@/lib/adapters/types'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}))

vi.mock('@/lib/ai/models', () => ({
  getZeroShotClassifier: vi.fn().mockResolvedValue(
    vi.fn().mockImplementation((text: string) => {
      const lower = text.toLowerCase()
      const hasBenefitContent = /insurance|health|401k|retirement|vacation|pto|medical|coverage|equity|remote|parental|wellness|tuition|bonus|leave|dental|vision|compensation/.test(lower)
      if (hasBenefitContent) {
        return Promise.resolve({
          labels: ['health insurance', 'paid time off', 'retirement benefits', 'equity compensation', 'remote work', 'parental leave', 'professional development', 'wellness benefits'],
          scores: [0.9, 0.8, 0.7, 0.3, 0.2, 0.1, 0.05, 0.02],
        })
      }
      return Promise.resolve({
        labels: ['health insurance', 'paid time off', 'retirement benefits', 'equity compensation', 'remote work', 'parental leave', 'professional development', 'wellness benefits'],
        scores: [0.1, 0.1, 0.05, 0.05, 0.02, 0.02, 0.01, 0.01],
      })
    }),
  ),
}))

import { normalize } from './normalizer'

function createRawListing(overrides?: Partial<RawJobListing>): RawJobListing {
  return {
    source_name: 'remoteok',
    external_id: 'test-123',
    title: 'Software Engineer',
    company: 'Google',
    source_url: 'https://example.com/job/123',
    description_text: 'Build amazing software products.',
    description_html: '<p>Build amazing software products.</p>',
    salary_min: 120000,
    salary_max: 180000,
    location: 'New York, NY',
    is_remote: false,
    raw_data: { original: true },
    ...overrides,
  }
}

describe('normalize', () => {
  describe('field transformations', () => {
    it('[P1] should normalize title to title case', async () => {
      const { normalized } = await normalize([
        createRawListing({ title: 'senior software engineer' }),
      ])
      expect(normalized[0].title).toBe('Senior Software Engineer')
    })

    it('[P1] should trim title and company', async () => {
      const { normalized } = await normalize([
        createRawListing({ title: '  Software Engineer  ', company: '  Google  ' }),
      ])
      expect(normalized[0].title).toBe('Software Engineer')
      expect(normalized[0].company).toBe('Google')
    })

    it('[P1] should preserve salary values from adapter', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: 100000, salary_max: 150000 }),
      ])
      expect(normalized[0].salaryMin).toBe(100000)
      expect(normalized[0].salaryMax).toBe(150000)
    })

    it('[P1] should handle missing salary', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: undefined, salary_max: undefined }),
      ])
      expect(normalized[0].salaryMin).toBeUndefined()
      expect(normalized[0].salaryMax).toBeUndefined()
    })

    it('[P1] should trim location', async () => {
      const { normalized } = await normalize([
        createRawListing({ location: '  San Francisco, CA  ' }),
      ])
      expect(normalized[0].location).toBe('San Francisco, CA')
    })

    it('[P1] should preserve description_html unchanged', async () => {
      const html = '<p>Build <b>amazing</b> software.</p>'
      const { normalized } = await normalize([
        createRawListing({ description_html: html }),
      ])
      expect(normalized[0].descriptionHtml).toBe(html)
    })

    it('[P1] should sanitize description_text for XSS', async () => {
      const { normalized } = await normalize([
        createRawListing({
          description_text: 'Hello <script>alert("xss")</script> world',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('<script')
      expect(normalized[0].descriptionText).toContain('Hello')
      expect(normalized[0].descriptionText).toContain('world')
    })

    it('[P1] should strip event handlers from description_text', async () => {
      const { normalized } = await normalize([
        createRawListing({
          description_text: 'Click <div onclick="alert(1)">here</div>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('onclick')
    })

    it('[P1] should set discoveredAt to current timestamp', async () => {
      const before = new Date()
      const { normalized } = await normalize([createRawListing()])
      const after = new Date()
      expect(normalized[0].discoveredAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(normalized[0].discoveredAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('[P1] should set pipelineStage to discovered', async () => {
      const { normalized } = await normalize([createRawListing()])
      expect(normalized[0].pipelineStage).toBe('discovered')
    })

    it('[P1] should preserve sourceUrl and applyUrl', async () => {
      const { normalized } = await normalize([
        createRawListing({
          source_url: 'https://example.com/job',
          apply_url: 'https://example.com/apply',
        }),
      ])
      expect(normalized[0].sourceUrl).toBe('https://example.com/job')
      expect(normalized[0].applyUrl).toBe('https://example.com/apply')
    })
  })

  describe('is_remote three-state contract', () => {
    it('[P1] should preserve explicit is_remote true from adapter', async () => {
      const { normalized } = await normalize([
        createRawListing({ is_remote: true }),
      ])
      expect(normalized[0].isRemote).toBe(true)
    })

    it('[P1] should preserve explicit is_remote false from adapter', async () => {
      const { normalized } = await normalize([
        createRawListing({ is_remote: false }),
      ])
      expect(normalized[0].isRemote).toBe(false)
    })

    it('[P1] should derive is_remote from location when undefined', async () => {
      const { normalized } = await normalize([
        createRawListing({ is_remote: undefined, location: 'Remote' }),
      ])
      expect(normalized[0].isRemote).toBe(true)
    })

    it('[P1] should set is_remote to undefined when location is unknown', async () => {
      const { normalized } = await normalize([
        createRawListing({ is_remote: undefined, location: undefined }),
      ])
      expect(normalized[0].isRemote).toBeUndefined()
    })
  })

  describe('fingerprint generation', () => {
    it('[P1] should generate same fingerprint for same title+company+location', async () => {
      const { normalized: [a] } = await normalize([createRawListing({ external_id: 'a' })])
      const { normalized: [b] } = await normalize([createRawListing({ external_id: 'b' })])
      expect(a.fingerprint).toBe(b.fingerprint)
    })

    it('[P1] should generate different fingerprints for different titles', async () => {
      const { normalized: [a] } = await normalize([
        createRawListing({ title: 'Software Engineer', external_id: 'a' }),
      ])
      const { normalized: [b] } = await normalize([
        createRawListing({ title: 'Data Scientist', external_id: 'b' }),
      ])
      expect(a.fingerprint).not.toBe(b.fingerprint)
    })

    it('[P1] should be case-insensitive', async () => {
      const { normalized: [a] } = await normalize([
        createRawListing({ title: 'Software Engineer', external_id: 'a' }),
      ])
      const { normalized: [b] } = await normalize([
        createRawListing({ title: 'software engineer', external_id: 'b' }),
      ])
      expect(a.fingerprint).toBe(b.fingerprint)
    })
  })

  describe('within-batch dedup', () => {
    it('[P1] should remove fingerprint-identical listings within same batch', async () => {
      const { normalized, skippedCount } = await normalize([
        createRawListing({ external_id: 'a' }),
        createRawListing({ external_id: 'b' }),
      ])
      expect(normalized.length).toBe(1)
      expect(skippedCount).toBe(1)
    })

    it('[P1] should keep listings with different fingerprints', async () => {
      const { normalized } = await normalize([
        createRawListing({ external_id: 'a', title: 'Software Engineer' }),
        createRawListing({ external_id: 'b', title: 'Data Scientist' }),
      ])
      expect(normalized.length).toBe(2)
    })
  })

  describe('source attribution', () => {
    it('[P1] should populate sources array with single source', async () => {
      const { normalized } = await normalize([createRawListing()])
      expect(normalized[0].sources).toHaveLength(1)
      expect(normalized[0].sources[0].name).toBe('remoteok')
      expect(normalized[0].sources[0].external_id).toBe('test-123')
      expect(normalized[0].sources[0].fetched_at).toBeTruthy()
    })
  })

  describe('benefits extraction', () => {
    it('[P1] should extract benefits from description text via zero-shot classification', async () => {
      const { normalized } = await normalize([
        createRawListing({
          description_text: 'We offer comprehensive health insurance, 401k retirement matching, and unlimited vacation days.',
        }),
      ])
      expect(normalized[0].benefits).toBeDefined()
      expect(normalized[0].benefits!.length).toBeGreaterThan(0)
      // The mock returns health insurance, paid time off, retirement benefits as high scores
      expect(normalized[0].benefits).toContain('health insurance')
    })

    it('[P1] should return undefined when no benefits found', async () => {
      const { normalized } = await normalize([
        createRawListing({
          description_text: 'Build amazing software products.',
        }),
      ])
      expect(normalized[0].benefits).toBeUndefined()
    })

    it('[P1] should classify paraphrased benefits (zero-shot)', async () => {
      const { normalized } = await normalize([
        createRawListing({
          description_text: 'We provide four weeks vacation and comprehensive medical coverage for all employees.',
        }),
      ])
      // The mock classifier should categorize these into standard labels
      expect(normalized[0].benefits).toBeDefined()
    })
  })

  describe('country extraction', () => {
    it('[P1] should extract country from US location', async () => {
      const { normalized } = await normalize([
        createRawListing({ location: 'San Francisco, CA' }),
      ])
      expect(normalized[0].country).toBe('US')
    })

    it('[P1] should extract country from international location', async () => {
      const { normalized } = await normalize([
        createRawListing({ location: 'Bangalore, India' }),
      ])
      expect(normalized[0].country).toBe('IN')
    })

    it('[P1] should default Remote to US', async () => {
      const { normalized } = await normalize([
        createRawListing({ location: 'Remote' }),
      ])
      expect(normalized[0].country).toBe('US')
    })

    it('[P1] should set Unknown for null location', async () => {
      const { normalized } = await normalize([
        createRawListing({ location: undefined }),
      ])
      expect(normalized[0].country).toBe('Unknown')
    })
  })

  describe('searchText population', () => {
    it('[P1] should populate searchText from title + company + description', async () => {
      const { normalized } = await normalize([createRawListing()])
      expect(normalized[0].searchText).toContain('Software Engineer')
      expect(normalized[0].searchText).toContain('Google')
      expect(normalized[0].searchText).toContain('Build amazing software products.')
    })
  })

  describe('salary validation', () => {
    it('[P1] should preserve valid salary values', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: 150000, salary_max: 250000 }),
      ])
      expect(normalized[0].salaryMin).toBe(150000)
      expect(normalized[0].salaryMax).toBe(250000)
    })

    it('[P1] should cap salaryMin above $500k as undefined (suspect data)', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: 1676000, salary_max: 200000 }),
      ])
      expect(normalized[0].salaryMin).toBeUndefined()
      expect(normalized[0].salaryMax).toBe(200000)
    })

    it('[P1] should cap salaryMax above $1M as undefined (suspect data)', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: 150000, salary_max: 3422000 }),
      ])
      expect(normalized[0].salaryMin).toBe(150000)
      expect(normalized[0].salaryMax).toBeUndefined()
    })

    it('[P1] should cap both salary values when both are suspect', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: 1676000, salary_max: 3422000 }),
      ])
      expect(normalized[0].salaryMin).toBeUndefined()
      expect(normalized[0].salaryMax).toBeUndefined()
    })

    it('[P1] should allow salaryMin at exactly $500k boundary', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: 500000 }),
      ])
      expect(normalized[0].salaryMin).toBe(500000)
    })

    it('[P1] should allow salaryMax at exactly $1M boundary', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_max: 1000000 }),
      ])
      expect(normalized[0].salaryMax).toBe(1000000)
    })

    it('[P1] should handle undefined salary values unchanged', async () => {
      const { normalized } = await normalize([
        createRawListing({ salary_min: undefined, salary_max: undefined }),
      ])
      expect(normalized[0].salaryMin).toBeUndefined()
      expect(normalized[0].salaryMax).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('[P1] should handle empty input array', async () => {
      const { normalized, skippedCount } = await normalize([])
      expect(normalized).toEqual([])
      expect(skippedCount).toBe(0)
    })

    it('[P1] should handle multiple valid listings from different sources', async () => {
      const { normalized } = await normalize([
        createRawListing({ source_name: 'remoteok', external_id: 'r1', title: 'Engineer' }),
        createRawListing({ source_name: 'jobicy', external_id: 'j1', title: 'Designer' }),
        createRawListing({ source_name: 'himalayas', external_id: 'h1', title: 'Manager' }),
      ])
      expect(normalized.length).toBe(3)
    })

    it('[P2] should strip javascript: URIs from description_text', async () => {
      const { normalized } = await normalize([
        createRawListing({
          description_text: 'Click javascript:alert(1) here',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('javascript:')
    })
  })
})
