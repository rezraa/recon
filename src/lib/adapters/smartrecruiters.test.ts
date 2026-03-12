import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/test-utils/msw/server'

import {
  _setDelay,
  fetchSmartRecruitersCompany,
  SMARTRECRUITERS_COMPANIES,
  smartrecruitersAdapter,
} from './smartrecruiters'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_SR_RESPONSE = {
  content: [
    {
      id: 'sr-job-1',
      name: 'Senior Software Engineer',
      uuid: 'uuid-abc-123',
      refNumber: 'REF001',
      company: { name: 'TestCo', identifier: 'testco' },
      location: { city: 'San Francisco', region: 'CA', country: 'US', remote: false },
      department: { label: 'Engineering' },
      typeOfEmployment: { label: 'Full-time' },
      experienceLevel: { label: 'Mid-Senior' },
      releasedDate: '2025-03-01T00:00:00Z',
    },
    {
      id: 'sr-job-2',
      name: 'SDET',
      uuid: 'uuid-def-456',
      company: { name: 'TestCo', identifier: 'testco' },
      location: { city: 'Remote', remote: true },
      department: { label: 'Quality' },
      releasedDate: '2025-03-02T00:00:00Z',
    },
  ],
  totalFound: 2,
  limit: 100,
  offset: 0,
}

const EMPTY_RESPONSE = { content: [], totalFound: 0, limit: 100, offset: 0 }

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  _setDelay(0)
})

afterEach(() => {
  _setDelay(500)
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('fetchSmartRecruitersCompany', () => {
  it('should fetch and parse jobs from a company', async () => {
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/testco/postings', () =>
        HttpResponse.json(MOCK_SR_RESPONSE),
      ),
    )

    const listings = await fetchSmartRecruitersCompany('testco', 'TestCo')

    expect(listings).toHaveLength(2)
    expect(listings[0]).toMatchObject({
      source_name: 'smartrecruiters',
      external_id: 'sr-testco-uuid-abc-123',
      title: 'Senior Software Engineer',
      company: 'TestCo',
      source_url: 'https://jobs.smartrecruiters.com/testco/sr-job-1',
    })
  })

  it('should format location from city and region', async () => {
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/testco/postings', () =>
        HttpResponse.json(MOCK_SR_RESPONSE),
      ),
    )

    const listings = await fetchSmartRecruitersCompany('testco', 'TestCo')
    expect(listings[0].location).toBe('San Francisco, CA')
    expect(listings[0].is_remote).toBe(false)
  })

  it('should detect remote jobs', async () => {
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/testco/postings', () =>
        HttpResponse.json(MOCK_SR_RESPONSE),
      ),
    )

    const listings = await fetchSmartRecruitersCompany('testco', 'TestCo')
    expect(listings[1].is_remote).toBe(true)
  })

  it('should include metadata in raw_data', async () => {
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/testco/postings', () =>
        HttpResponse.json(MOCK_SR_RESPONSE),
      ),
    )

    const listings = await fetchSmartRecruitersCompany('testco', 'TestCo')
    expect(listings[0].raw_data).toMatchObject({
      smartrecruiters_id: 'sr-job-1',
      uuid: 'uuid-abc-123',
      slug: 'testco',
      department: 'Engineering',
      typeOfEmployment: 'Full-time',
      experienceLevel: 'Mid-Senior',
    })
  })

  it('should return empty array for company with no jobs', async () => {
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/nojobs/postings', () =>
        HttpResponse.json(EMPTY_RESPONSE),
      ),
    )

    const listings = await fetchSmartRecruitersCompany('nojobs', 'NoJobs Inc')
    expect(listings).toHaveLength(0)
  })

  it('should paginate when there are more than 100 jobs', async () => {
    let requestCount = 0
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/bigco/postings', ({ request }) => {
        requestCount++
        const url = new URL(request.url)
        const offset = parseInt(url.searchParams.get('offset') ?? '0')

        if (offset === 0) {
          // First page: 100 jobs
          const jobs = Array.from({ length: 100 }, (_, i) => ({
            id: `job-${i}`,
            name: `Engineer ${i}`,
            uuid: `uuid-${i}`,
            company: { name: 'BigCo', identifier: 'bigco' },
            location: { city: 'NYC', region: 'NY', country: 'US' },
            releasedDate: '2025-03-01T00:00:00Z',
          }))
          return HttpResponse.json({ content: jobs, totalFound: 150, limit: 100, offset: 0 })
        }

        // Second page: 50 jobs
        const jobs = Array.from({ length: 50 }, (_, i) => ({
          id: `job-${100 + i}`,
          name: `Engineer ${100 + i}`,
          uuid: `uuid-${100 + i}`,
          company: { name: 'BigCo', identifier: 'bigco' },
          location: { city: 'NYC', region: 'NY', country: 'US' },
          releasedDate: '2025-03-01T00:00:00Z',
        }))
        return HttpResponse.json({ content: jobs, totalFound: 150, limit: 100, offset: 100 })
      }),
    )

    const listings = await fetchSmartRecruitersCompany('bigco', 'BigCo')
    expect(listings).toHaveLength(150)
    expect(requestCount).toBe(2)
  })

  it('should throw on network error', async () => {
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/badco/postings', () =>
        HttpResponse.error(),
      ),
    )

    await expect(fetchSmartRecruitersCompany('badco', 'Bad Co')).rejects.toThrow()
  })
})

describe('smartrecruitersAdapter', () => {
  it('should have correct metadata', () => {
    expect(smartrecruitersAdapter.name).toBe('smartrecruiters')
    expect(smartrecruitersAdapter.displayName).toBe('SmartRecruiters')
    expect(smartrecruitersAdapter.type).toBe('open')
  })

  it('should fetch from multiple companies', async () => {
    const firstSlug = SMARTRECRUITERS_COMPANIES[0].slug

    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/:slug/postings', ({ params }) => {
        if (params.slug === firstSlug) {
          return HttpResponse.json({
            content: [
              {
                id: 'test-1',
                name: 'Engineer',
                uuid: 'test-uuid-1',
                company: { name: firstSlug, identifier: firstSlug },
                location: { remote: true },
                releasedDate: '2025-03-01T00:00:00Z',
              },
            ],
            totalFound: 1,
            limit: 100,
            offset: 0,
          })
        }
        return HttpResponse.json(EMPTY_RESPONSE)
      }),
    )

    const listings = await smartrecruitersAdapter.fetchListings({
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    })

    expect(listings.length).toBeGreaterThanOrEqual(1)
    expect(listings[0].source_name).toBe('smartrecruiters')
  })

  it('should filter by target titles', async () => {
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/:slug/postings', () =>
        HttpResponse.json(MOCK_SR_RESPONSE),
      ),
    )

    const listings = await smartrecruitersAdapter.fetchListings({
      preferences: { targetTitles: ['SDET'], locations: [], remotePreference: null },
    })

    const sdetJobs = listings.filter((l) => l.title === 'SDET')
    const nonSdetJobs = listings.filter((l) => l.title !== 'SDET')

    expect(sdetJobs.length).toBeGreaterThan(0)
    expect(nonSdetJobs.length).toBe(0)
  })

  it('should continue when a company fetch fails', async () => {
    let callCount = 0
    server.use(
      http.get('https://api.smartrecruiters.com/v1/companies/:slug/postings', () => {
        callCount++
        if (callCount === 1) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json(EMPTY_RESPONSE)
      }),
    )

    const listings = await smartrecruitersAdapter.fetchListings({
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    })

    expect(Array.isArray(listings)).toBe(true)
    expect(callCount).toBeGreaterThan(1)
  })
})

describe('SMARTRECRUITERS_COMPANIES seed list', () => {
  it('should have unique slugs', () => {
    const slugs = SMARTRECRUITERS_COMPANIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('should have non-empty names and slugs', () => {
    for (const company of SMARTRECRUITERS_COMPANIES) {
      expect(company.slug.length).toBeGreaterThan(0)
      expect(company.name.length).toBeGreaterThan(0)
    }
  })

  it('should contain at least 10 companies', () => {
    expect(SMARTRECRUITERS_COMPANIES.length).toBeGreaterThanOrEqual(10)
  })
})
