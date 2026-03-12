import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/test-utils/msw/server'

import {
  _setDelay,
  ASHBY_COMPANIES,
  ashbyAdapter,
  fetchAshbyCompany,
} from './ashby'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_ASHBY_RESPONSE = {
  jobs: [
    {
      id: 'abc-123',
      title: 'Senior Backend Engineer',
      location: 'San Francisco, CA',
      department: 'Engineering',
      team: 'Platform',
      publishedAt: '2025-03-01T00:00:00Z',
      jobUrl: 'https://jobs.ashbyhq.com/testco/abc-123',
      descriptionHtml: '<p>We need a backend engineer. Compensation: $180,000 - $220,000 USD.</p>',
      descriptionPlain: 'We need a backend engineer. Compensation: $180,000 - $220,000 USD.',
      isRemote: false,
      compensationTierSummary: '$180,000 - $220,000 USD',
    },
    {
      id: 'def-456',
      title: 'SDET',
      location: 'Remote (US)',
      department: 'Engineering',
      publishedAt: '2025-03-02T00:00:00Z',
      jobUrl: 'https://jobs.ashbyhq.com/testco/def-456',
      descriptionHtml: '<p>Quality engineering role.</p>',
      descriptionPlain: 'Quality engineering role.',
      isRemote: true,
    },
  ],
  apiVersion: '1.0',
}

const EMPTY_RESPONSE = { jobs: [], apiVersion: '1.0' }

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  _setDelay(0)
})

afterEach(() => {
  _setDelay(500)
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('fetchAshbyCompany', () => {
  it('should fetch and parse jobs from a company', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')

    expect(listings).toHaveLength(2)
    expect(listings[0]).toMatchObject({
      source_name: 'ashby',
      external_id: 'ashby-testco-abc-123',
      title: 'Senior Backend Engineer',
      company: 'TestCo',
      source_url: 'https://jobs.ashbyhq.com/testco/abc-123',
    })
  })

  it('should extract location', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')
    expect(listings[0].location).toBe('San Francisco, CA')
    expect(listings[0].is_remote).toBe(false)
  })

  it('should detect remote jobs from isRemote field', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')
    expect(listings[1].is_remote).toBe(true)
  })

  it('should parse salary from compensationTierSummary', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')
    expect(listings[0].salary_min).toBe(180000)
    expect(listings[0].salary_max).toBe(220000)
  })

  it('should handle jobs without salary', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')
    expect(listings[1].salary_min).toBeUndefined()
    expect(listings[1].salary_max).toBeUndefined()
  })

  it('should include department and team in raw_data', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')
    expect(listings[0].raw_data).toMatchObject({
      ashby_id: 'abc-123',
      slug: 'testco',
      department: 'Engineering',
      team: 'Platform',
    })
  })

  it('should return empty array for company with no jobs', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/nojobs', () =>
        HttpResponse.json(EMPTY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('nojobs', 'NoJobs Inc')
    expect(listings).toHaveLength(0)
  })

  it('should throw on network error', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/badco', () =>
        HttpResponse.error(),
      ),
    )

    await expect(fetchAshbyCompany('badco', 'Bad Co')).rejects.toThrow()
  })

  it('should use descriptionPlain when available', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')
    // descriptionPlain is used directly, not stripped HTML
    expect(listings[0].description_text).toBe('We need a backend engineer. Compensation: $180,000 - $220,000 USD.')
  })

  it('should fall back to stripped HTML when descriptionPlain is missing', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/testco', () =>
        HttpResponse.json({
          jobs: [
            {
              id: 'x-1',
              title: 'Dev',
              location: 'Remote',
              department: 'Eng',
              publishedAt: '2025-03-01T00:00:00Z',
              jobUrl: 'https://jobs.ashbyhq.com/testco/x-1',
              descriptionHtml: '<p>HTML only description</p>',
              // No descriptionPlain
            },
          ],
          apiVersion: '1.0',
        }),
      ),
    )

    const listings = await fetchAshbyCompany('testco', 'TestCo')
    expect(listings[0].description_text).toBe('HTML only description')
  })
})

describe('ashbyAdapter', () => {
  it('should have correct metadata', () => {
    expect(ashbyAdapter.name).toBe('ashby')
    expect(ashbyAdapter.displayName).toBe('Ashby')
    expect(ashbyAdapter.type).toBe('open')
  })

  it('should fetch from multiple companies', async () => {
    const firstSlug = ASHBY_COMPANIES[0].slug

    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/:slug', ({ params }) => {
        if (params.slug === firstSlug) {
          return HttpResponse.json({
            jobs: [
              {
                id: 'test-1',
                title: 'Engineer',
                location: 'Remote',
                department: 'Eng',
                publishedAt: '2025-03-01T00:00:00Z',
                jobUrl: `https://jobs.ashbyhq.com/${firstSlug}/test-1`,
                descriptionPlain: 'Test job',
                isRemote: true,
              },
            ],
            apiVersion: '1.0',
          })
        }
        return HttpResponse.json(EMPTY_RESPONSE)
      }),
    )

    const listings = await ashbyAdapter.fetchListings({
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    })

    expect(listings.length).toBeGreaterThanOrEqual(1)
    expect(listings[0].source_name).toBe('ashby')
  })

  it('should filter by target titles', async () => {
    server.use(
      http.get('https://api.ashbyhq.com/posting-api/job-board/:slug', () =>
        HttpResponse.json(MOCK_ASHBY_RESPONSE),
      ),
    )

    const listings = await ashbyAdapter.fetchListings({
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
      http.get('https://api.ashbyhq.com/posting-api/job-board/:slug', () => {
        callCount++
        if (callCount === 1) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json(EMPTY_RESPONSE)
      }),
    )

    const listings = await ashbyAdapter.fetchListings({
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    })

    expect(Array.isArray(listings)).toBe(true)
    expect(callCount).toBeGreaterThan(1)
  })
})

describe('ASHBY_COMPANIES seed list', () => {
  it('should have unique slugs', () => {
    const slugs = ASHBY_COMPANIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('should have non-empty names and slugs', () => {
    for (const company of ASHBY_COMPANIES) {
      expect(company.slug.length).toBeGreaterThan(0)
      expect(company.name.length).toBeGreaterThan(0)
    }
  })

  it('should contain at least 15 companies', () => {
    expect(ASHBY_COMPANIES.length).toBeGreaterThanOrEqual(15)
  })
})
