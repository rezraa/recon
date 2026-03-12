import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/test-utils/msw/server'

import {
  _setDelay,
  fetchGreenhouseCompany,
  GREENHOUSE_COMPANIES,
  greenhouseAdapter,
} from './greenhouse'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_GREENHOUSE_RESPONSE = {
  jobs: [
    {
      id: 12345,
      title: 'Senior Software Engineer',
      updated_at: '2025-03-01T00:00:00Z',
      absolute_url: 'https://boards.greenhouse.io/testco/jobs/12345',
      location: { name: 'San Francisco, CA' },
      content: '<p>We are looking for a Senior Software Engineer. Salary range: $150,000 - $200,000.</p>',
      departments: [{ name: 'Engineering' }],
      offices: [{ name: 'SF Office', location: 'San Francisco, CA' }],
    },
    {
      id: 12346,
      title: 'Product Manager',
      updated_at: '2025-03-02T00:00:00Z',
      absolute_url: 'https://boards.greenhouse.io/testco/jobs/12346',
      location: { name: 'Remote' },
      content: '<p>Join our product team!</p>',
      departments: [{ name: 'Product' }],
      offices: [],
    },
    {
      id: 12347,
      title: 'SDET',
      updated_at: '2025-03-03T00:00:00Z',
      absolute_url: 'https://boards.greenhouse.io/testco/jobs/12347',
      location: { name: 'Remote - US' },
      content: '<p>Quality engineering role. Compensation range: $120k-$160k per year.</p>',
      departments: [{ name: 'Engineering' }],
      offices: [],
    },
  ],
  meta: { total: 3 },
}

const EMPTY_RESPONSE = { jobs: [] }

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  _setDelay(0) // No delay in tests
})

afterEach(() => {
  _setDelay(500) // Reset
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('fetchGreenhouseCompany', () => {
  it('should fetch and parse jobs from a company', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/testco/jobs', () =>
        HttpResponse.json(MOCK_GREENHOUSE_RESPONSE),
      ),
    )

    const listings = await fetchGreenhouseCompany('testco', 'TestCo')

    expect(listings).toHaveLength(3)
    expect(listings[0]).toMatchObject({
      source_name: 'greenhouse',
      external_id: 'gh-testco-12345',
      title: 'Senior Software Engineer',
      company: 'TestCo',
      source_url: 'https://boards.greenhouse.io/testco/jobs/12345',
    })
  })

  it('should extract location from job', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/testco/jobs', () =>
        HttpResponse.json(MOCK_GREENHOUSE_RESPONSE),
      ),
    )

    const listings = await fetchGreenhouseCompany('testco', 'TestCo')

    expect(listings[0].location).toBe('San Francisco, CA')
    expect(listings[0].is_remote).toBeFalsy()
  })

  it('should detect remote jobs', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/testco/jobs', () =>
        HttpResponse.json(MOCK_GREENHOUSE_RESPONSE),
      ),
    )

    const listings = await fetchGreenhouseCompany('testco', 'TestCo')

    // "Remote" location
    expect(listings[1].is_remote).toBe(true)
    // "Remote - US" location
    expect(listings[2].is_remote).toBe(true)
  })

  it('should strip HTML from description', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/testco/jobs', () =>
        HttpResponse.json(MOCK_GREENHOUSE_RESPONSE),
      ),
    )

    const listings = await fetchGreenhouseCompany('testco', 'TestCo')

    expect(listings[0].description_text).not.toContain('<p>')
    expect(listings[0].description_text).toContain('Senior Software Engineer')
  })

  it('should parse salary from description', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/testco/jobs', () =>
        HttpResponse.json(MOCK_GREENHOUSE_RESPONSE),
      ),
    )

    const listings = await fetchGreenhouseCompany('testco', 'TestCo')

    // "$150,000 - $200,000"
    expect(listings[0].salary_min).toBe(150000)
    expect(listings[0].salary_max).toBe(200000)
  })

  it('should include departments and offices in raw_data', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/testco/jobs', () =>
        HttpResponse.json(MOCK_GREENHOUSE_RESPONSE),
      ),
    )

    const listings = await fetchGreenhouseCompany('testco', 'TestCo')

    expect(listings[0].raw_data).toMatchObject({
      greenhouse_id: 12345,
      slug: 'testco',
      departments: ['Engineering'],
    })
  })

  it('should return empty array for company with no jobs', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/nojobs/jobs', () =>
        HttpResponse.json(EMPTY_RESPONSE),
      ),
    )

    const listings = await fetchGreenhouseCompany('nojobs', 'NoJobs Inc')
    expect(listings).toHaveLength(0)
  })

  it('should handle missing content gracefully', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/testco/jobs', () =>
        HttpResponse.json({
          jobs: [
            {
              id: 99999,
              title: 'Backend Engineer',
              updated_at: '2025-03-01T00:00:00Z',
              absolute_url: 'https://boards.greenhouse.io/testco/jobs/99999',
              location: { name: 'NYC' },
              // No content field
            },
          ],
        }),
      ),
    )

    const listings = await fetchGreenhouseCompany('testco', 'TestCo')

    expect(listings).toHaveLength(1)
    expect(listings[0].description_text).toBe('Backend Engineer')
  })

  it('should throw on network error', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/badco/jobs', () =>
        HttpResponse.error(),
      ),
    )

    await expect(fetchGreenhouseCompany('badco', 'Bad Co')).rejects.toThrow()
  })

  it('should throw on 404', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/notfound/jobs', () =>
        new HttpResponse(null, { status: 404 }),
      ),
    )

    await expect(fetchGreenhouseCompany('notfound', 'Not Found')).rejects.toThrow()
  })
})

describe('greenhouseAdapter', () => {
  it('should have correct metadata', () => {
    expect(greenhouseAdapter.name).toBe('greenhouse')
    expect(greenhouseAdapter.displayName).toBe('Greenhouse')
    expect(greenhouseAdapter.type).toBe('open')
  })

  it('should fetch from multiple companies', async () => {
    const firstSlug = GREENHOUSE_COMPANIES[0].slug

    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/:slug/jobs', ({ params }) => {
        const slug = params.slug as string

        if (slug === firstSlug) {
          return HttpResponse.json({
            jobs: [
              {
                id: 1,
                title: 'Engineer',
                updated_at: '2025-03-01T00:00:00Z',
                absolute_url: `https://boards.greenhouse.io/${slug}/jobs/1`,
                location: { name: 'Remote' },
                content: '<p>Test</p>',
              },
            ],
          })
        }

        // All other companies return empty
        return HttpResponse.json(EMPTY_RESPONSE)
      }),
    )

    const listings = await greenhouseAdapter.fetchListings({
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    })

    expect(listings.length).toBeGreaterThanOrEqual(1)
    expect(listings[0].source_name).toBe('greenhouse')
  })

  it('should filter by target titles when specified', async () => {
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/:slug/jobs', () =>
        HttpResponse.json(MOCK_GREENHOUSE_RESPONSE),
      ),
    )

    const listings = await greenhouseAdapter.fetchListings({
      preferences: { targetTitles: ['SDET'], locations: [], remotePreference: null },
    })

    // Only the SDET job should match
    const sdetJobs = listings.filter((l) => l.title === 'SDET')
    const nonSdetJobs = listings.filter((l) => l.title !== 'SDET')

    expect(sdetJobs.length).toBeGreaterThan(0)
    expect(nonSdetJobs.length).toBe(0)
  })

  it('should continue when a company fetch fails', async () => {
    let callCount = 0
    server.use(
      http.get('https://boards-api.greenhouse.io/v1/boards/:slug/jobs', () => {
        callCount++
        // First company fails, rest succeed
        if (callCount === 1) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json(EMPTY_RESPONSE)
      }),
    )

    // Should not throw — errors are collected, not thrown
    const listings = await greenhouseAdapter.fetchListings({
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    })

    expect(Array.isArray(listings)).toBe(true)
    // Should have attempted all companies even if some fail
    expect(callCount).toBe(GREENHOUSE_COMPANIES.length)
  })
})

describe('GREENHOUSE_COMPANIES seed list', () => {
  it('should have unique slugs', () => {
    const slugs = GREENHOUSE_COMPANIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('should have non-empty names and slugs', () => {
    for (const company of GREENHOUSE_COMPANIES) {
      expect(company.slug.length).toBeGreaterThan(0)
      expect(company.name.length).toBeGreaterThan(0)
    }
  })

  // TODO: restore to 30 when full company list is uncommented for go-live
  it('should contain at least 1 company (smoke test mode)', () => {
    expect(GREENHOUSE_COMPANIES.length).toBeGreaterThanOrEqual(1)
  })
})
