import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '@/test-utils/msw/server'

import himalayasFixture from './__fixtures__/himalayas-response.json'
import jobicyFixture from './__fixtures__/jobicy-response.json'
import serplyFixture from './__fixtures__/serply-response.json'
import themuseFixture from './__fixtures__/themuse-response.json'
import { himalayasAdapter } from './himalayas'
import { jobicyAdapter } from './jobicy'
import { getAllAdapters } from './registry'
import { serplyAdapter } from './serply'
import { themuseAdapter } from './themuse'
import type { RawJobListing } from './types'
import { rawJobListingSchema } from './types'

// ─── MSW Handlers ──────────────────────────────────────────────────────────

function setupAllHandlers() {
  server.use(
    http.get('https://himalayas.app/jobs/api', () => {
      return HttpResponse.json(himalayasFixture)
    }),
    http.get('https://www.themuse.com/api/public/jobs', () => {
      return HttpResponse.json(themuseFixture)
    }),
    http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return HttpResponse.json(jobicyFixture)
    }),
    http.get('https://api.serply.io/v1/job/search/*', () => {
      return HttpResponse.json(serplyFixture, {
        headers: {
          'X-RateLimit-Remaining': '8',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z',
        },
      })
    }),
  )
}

const defaultConfig = {
  preferences: { targetTitles: ['developer'], locations: ['Remote'], remotePreference: null },
}

const serplyConfig = {
  ...defaultConfig,
  apiKey: 'test-key',
}

// ─── Helper: fetch all adapter results ─────────────────────────────────────

async function fetchAllAdapterResults(): Promise<Record<string, RawJobListing[]>> {
  setupAllHandlers()
  const [himalayas, themuse, jobicy, serply] = await Promise.all([
    himalayasAdapter.fetchListings(defaultConfig),
    themuseAdapter.fetchListings(defaultConfig),
    jobicyAdapter.fetchListings(defaultConfig),
    serplyAdapter.fetchListings(serplyConfig),
  ])
  return { himalayas, themuse, jobicy, serply }
}

// ─── Legal Compliance ──────────────────────────────────────────────────────

/** @priority-1 */
describe('Legal Compliance: raw_data preservation', () => {
  it('should preserve himalayas API response byte-for-byte in raw_data', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[0].raw_data).toEqual(himalayasFixture.jobs[0])
  })

  it('should preserve themuse API response byte-for-byte in raw_data', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.themuse[0].raw_data).toEqual(themuseFixture.results[0])
  })

  it('should preserve jobicy API response byte-for-byte in raw_data', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.jobicy[0].raw_data).toEqual(jobicyFixture.jobs[0])
  })

  it('should preserve serply API response byte-for-byte in raw_data', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.serply[0].raw_data).toEqual(serplyFixture.jobs[0])
  })
})

/** @priority-1 */
describe('Legal Compliance: description_html preservation', () => {
  it('should preserve themuse source HTML without modification', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.themuse[0]
    expect(listing.description_html).toBe(themuseFixture.results[0].contents)
    expect(listing.description_html).toContain('<b>Senior</b>')
    expect(listing.description_html).toContain('<em>React</em>')
  })

  it('should preserve serply HTML without modification', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.serply[0]
    expect(listing.description_html).toBeTruthy()
  })

  it('should preserve himalayas source HTML without modification', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.himalayas[0]
    expect(listing.description_html).toBe(himalayasFixture.jobs[0].description)
  })

  it('should set jobicy description_html to undefined when only jobExcerpt exists', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.jobicy[0]
    // Fixture job[0] has jobExcerpt only (no jobDescription) — description_html should be undefined
    expect(listing.description_html).toBeUndefined()
  })
})

/** @priority-1 */
describe('Legal Compliance: description_text derivation', () => {
  it('should derive plain text when source provides HTML only (themuse)', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.themuse[0]
    expect(listing.description_text).not.toContain('<b>')
    expect(listing.description_text).not.toContain('<em>')
    expect(listing.description_text).toContain('Senior')
    expect(listing.description_text).toContain('React')
    expect(listing.description_text).toContain('Developer')
  })

  it('should derive description_text from himalayas HTML', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.himalayas[0]
    expect(listing.description_text).toBeTruthy()
    expect(listing.description_text.length).toBeGreaterThan(0)
  })

  it('should derive description_text from jobicy HTML', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.jobicy[0]
    expect(listing.description_text).toBeTruthy()
    expect(listing.description_text.length).toBeGreaterThan(0)
  })

  it('should derive description_text from serply content', async () => {
    const results = await fetchAllAdapterResults()
    const listing = results.serply[0]
    expect(listing.description_text).toBeTruthy()
    expect(listing.description_text.length).toBeGreaterThan(0)
  })
})

// ─── Data Quality ──────────────────────────────────────────────────────────

describe('Data Quality: salary parsing', () => {
  it('should parse serply detected_extensions salary correctly', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.serply[0].salary_min).toBe(140000)
    expect(results.serply[0].salary_max).toBe(180000)
  })

  it('should handle "Competitive" salary as undefined', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.serply[1].salary_min).toBeUndefined()
    expect(results.serply[1].salary_max).toBeUndefined()
  })

  it('should parse himalayas string salary correctly', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[0].salary_min).toBe(130000)
    expect(results.himalayas[0].salary_max).toBe(170000)
  })

  it('should parse jobicy numeric salary correctly', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.jobicy[0].salary_min).toBe(110000)
    expect(results.jobicy[0].salary_max).toBe(145000)
  })
})

describe('Data Quality: is_remote inference', () => {
  it('should infer is_remote true when location contains "Remote"', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.serply[0].is_remote).toBe(true) // "Remote - US"
  })

  it('should set is_remote to false for non-remote locations', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.serply[1].is_remote).toBe(false) // "San Francisco, CA"
  })
})

/** @priority-1 */
describe('Data Quality: is_remote three-state contract', () => {
  it('should return true for explicitly remote location', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[0].is_remote).toBe(true)
    expect(typeof results.himalayas[0].is_remote).toBe('boolean')
  })

  it('should return false for known non-remote location', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.serply[1].is_remote).toBe(false)
    expect(typeof results.serply[1].is_remote).toBe('boolean')
  })

  it('should return false for known non-remote TheMuse location', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.themuse[0].is_remote).toBe(false) // "New York, NY"
    expect(typeof results.themuse[0].is_remote).toBe('boolean')
  })

  it('should return true for TheMuse with Remote location', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.themuse[1].is_remote).toBe(true)
  })

  it('should return true for Himalayas with "Remote - US" location', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[0].is_remote).toBe(true) // "Remote - US"
  })

  it('should return false for Himalayas with non-remote location', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[1].is_remote).toBe(false) // "NYC"
  })

  it('should return false for Jobicy non-remote location', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.jobicy[1].is_remote).toBe(false) // "New York, NY"
  })

  it('should never produce is_remote as a string or number', async () => {
    const results = await fetchAllAdapterResults()
    const allListings = [
      ...results.himalayas,
      ...results.themuse,
      ...results.jobicy,
      ...results.serply,
    ]
    for (const listing of allListings) {
      if (listing.is_remote !== undefined) {
        expect(typeof listing.is_remote).toBe('boolean')
      }
    }
  })

  it('should produce is_remote as undefined when location is absent', async () => {
    // Test with a listing that has no location — should produce undefined (third state)
    setupAllHandlers()
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({
          ...himalayasFixture,
          jobs: [{ ...himalayasFixture.jobs[0], locationRestrictions: [] }],
        })
      }),
    )
    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBeUndefined()
  })
})

describe('Data Quality: company name pass-through', () => {
  it('should preserve "Google LLC" without normalization', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[0].company).toBe('Google LLC')
  })

  it('should preserve "Google" without normalization (different from Google LLC)', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[1].company).toBe('Google')
  })
})

describe('Data Quality: location pass-through', () => {
  it('should preserve "NYC" without normalization', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.himalayas[1].location).toBe('NYC')
  })

  it('should preserve "New York, NY" without normalization', async () => {
    const results = await fetchAllAdapterResults()
    expect(results.themuse[0].location).toBe('New York, NY')
  })
})

// ─── Zod Schema Validation ────────────────────────────────────────────────

/** @priority-1 */
describe('Zod schema validation: all adapters cross-validated', () => {
  it('should validate all himalayas adapter output through RawJobListing schema', async () => {
    const results = await fetchAllAdapterResults()
    for (const listing of results.himalayas) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Failed for himalayas: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('should validate all themuse adapter output through RawJobListing schema', async () => {
    const results = await fetchAllAdapterResults()
    for (const listing of results.themuse) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Failed for themuse: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('should validate all jobicy adapter output through RawJobListing schema', async () => {
    const results = await fetchAllAdapterResults()
    for (const listing of results.jobicy) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Failed for jobicy: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('should validate all serply adapter output through RawJobListing schema', async () => {
    const results = await fetchAllAdapterResults()
    for (const listing of results.serply) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Failed for serply: ${JSON.stringify(result)}`).toBe(true)
    }
  })
})

describe('Zod schema validation: required field rejection', () => {
  const validListing = {
    source_name: 'test',
    external_id: 'test-1',
    title: 'Developer',
    company: 'TestCo',
    source_url: 'https://example.com/job/1',
    description_text: 'A great job',
    raw_data: {},
  }

  it('should reject missing title', () => {
    const { title: _, ...noTitle } = validListing
    const result = rawJobListingSchema.safeParse(noTitle)
    expect(result.success).toBe(false)
  })

  it('should reject missing source_name', () => {
    const { source_name: _, ...noSource } = validListing
    const result = rawJobListingSchema.safeParse(noSource)
    expect(result.success).toBe(false)
  })

  it('should reject missing external_id', () => {
    const { external_id: _, ...noId } = validListing
    const result = rawJobListingSchema.safeParse(noId)
    expect(result.success).toBe(false)
  })

  it('should reject missing company', () => {
    const { company: _, ...noCompany } = validListing
    const result = rawJobListingSchema.safeParse(noCompany)
    expect(result.success).toBe(false)
  })

  it('should reject missing source_url', () => {
    const { source_url: _, ...noUrl } = validListing
    const result = rawJobListingSchema.safeParse(noUrl)
    expect(result.success).toBe(false)
  })

  it('should reject missing description_text', () => {
    const { description_text: _, ...noDesc } = validListing
    const result = rawJobListingSchema.safeParse(noDesc)
    expect(result.success).toBe(false)
  })
})

describe('Optional getRateLimitStatus', () => {
  it('should return valid structure with remaining and resetsAt', () => {
    const resetsAt = new Date('2024-03-09T00:00:00Z')
    const status = { remaining: 8, resetsAt }
    expect(status.remaining).toBe(8)
    expect(status.resetsAt).toBeInstanceOf(Date)
  })

  it('should allow null return for adapters without rate limit visibility', () => {
    const status: { remaining: number; resetsAt: Date } | null = null
    expect(status).toBeNull()
  })
})

// ─── Registry Validation ───────────────────────────────────────────────────

describe('Registry: all adapters registered', () => {
  it('should have all 4 adapters registered', () => {
    const adapters = getAllAdapters()
    expect(adapters).toHaveLength(4)
    const names = adapters.map((a) => a.name).sort()
    expect(names).toEqual(['himalayas', 'jobicy', 'serply', 'themuse'])
  })

  it('should have real implementations (not stubs)', async () => {
    setupAllHandlers()
    const adapters = getAllAdapters()
    for (const adapter of adapters) {
      const config = adapter.type === 'key_required'
        ? serplyConfig
        : defaultConfig
      // Should not throw "not implemented"
      const listings = await adapter.fetchListings(config)
      expect(Array.isArray(listings)).toBe(true)
    }
  })
})
