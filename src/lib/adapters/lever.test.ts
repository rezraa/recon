import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/test-utils/msw/server'

import {
  _setDelay,
  fetchLeverCompany,
  LEVER_COMPANIES,
  leverAdapter,
} from './lever'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_LEVER_RESPONSE = [
  {
    id: 'abc-123-def',
    text: 'Senior Software Engineer',
    descriptionPlain: 'We need an experienced engineer.',
    description: '<p>We need an experienced engineer.</p>',
    additionalPlain: 'Benefits include 401k.',
    categories: {
      commitment: 'Full-time',
      department: 'Engineering',
      location: 'San Francisco, CA',
      team: 'Platform',
    },
    hostedUrl: 'https://jobs.lever.co/testco/abc-123-def',
    applyUrl: 'https://jobs.lever.co/testco/abc-123-def/apply',
    createdAt: 1709251200000,
    workplaceType: 'onsite',
    salaryRange: { min: 180000, max: 250000, currency: 'USD', interval: 'per-year' },
  },
  {
    id: 'ghi-456-jkl',
    text: 'SDET',
    descriptionPlain: 'Quality engineering role.',
    categories: {
      commitment: 'Full-time',
      department: 'Engineering',
      location: 'Remote',
    },
    hostedUrl: 'https://jobs.lever.co/testco/ghi-456-jkl',
    applyUrl: 'https://jobs.lever.co/testco/ghi-456-jkl/apply',
    createdAt: 1709337600000,
    workplaceType: 'remote',
  },
]

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  _setDelay(0)
})

afterEach(() => {
  _setDelay(500)
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('fetchLeverCompany', () => {
  it('should fetch and parse jobs from a company', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/testco', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await fetchLeverCompany('testco', 'TestCo')

    expect(listings).toHaveLength(2)
    expect(listings[0]).toMatchObject({
      source_name: 'lever',
      external_id: 'lever-testco-abc-123-def',
      title: 'Senior Software Engineer',
      company: 'TestCo',
      source_url: 'https://jobs.lever.co/testco/abc-123-def',
      apply_url: 'https://jobs.lever.co/testco/abc-123-def/apply',
    })
  })

  it('should extract location from categories', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/testco', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await fetchLeverCompany('testco', 'TestCo')
    expect(listings[0].location).toBe('San Francisco, CA')
    expect(listings[0].is_remote).toBeFalsy()
  })

  it('should detect remote from workplaceType', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/testco', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await fetchLeverCompany('testco', 'TestCo')
    expect(listings[1].is_remote).toBe(true)
  })

  it('should parse salary from salaryRange', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/testco', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await fetchLeverCompany('testco', 'TestCo')
    expect(listings[0].salary_min).toBe(180000)
    expect(listings[0].salary_max).toBe(250000)
  })

  it('should handle jobs without salary', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/testco', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await fetchLeverCompany('testco', 'TestCo')
    expect(listings[1].salary_min).toBeUndefined()
  })

  it('should combine description and additional text', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/testco', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await fetchLeverCompany('testco', 'TestCo')
    expect(listings[0].description_text).toContain('experienced engineer')
    expect(listings[0].description_text).toContain('401k')
  })

  it('should include department and team in raw_data', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/testco', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await fetchLeverCompany('testco', 'TestCo')
    expect(listings[0].raw_data).toMatchObject({
      lever_id: 'abc-123-def',
      slug: 'testco',
      department: 'Engineering',
      team: 'Platform',
      commitment: 'Full-time',
      workplaceType: 'onsite',
    })
  })

  it('should return empty array when company has no jobs', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/nojobs', () =>
        HttpResponse.json([]),
      ),
    )

    const listings = await fetchLeverCompany('nojobs', 'NoJobs Inc')
    expect(listings).toHaveLength(0)
  })

  it('should throw on network error', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/badco', () =>
        HttpResponse.error(),
      ),
    )

    await expect(fetchLeverCompany('badco', 'Bad Co')).rejects.toThrow()
  })
})

describe('leverAdapter', () => {
  it('should have correct metadata', () => {
    expect(leverAdapter.name).toBe('lever')
    expect(leverAdapter.displayName).toBe('Lever')
    expect(leverAdapter.type).toBe('open')
  })

  it('should filter by target titles', async () => {
    server.use(
      http.get('https://api.lever.co/v0/postings/:slug', () =>
        HttpResponse.json(MOCK_LEVER_RESPONSE),
      ),
    )

    const listings = await leverAdapter.fetchListings({
      preferences: { targetTitles: ['SDET'], locations: [], remotePreference: null },
    })

    expect(listings.every((l) => l.title === 'SDET')).toBe(true)
    expect(listings.length).toBeGreaterThan(0)
  })

  it('should continue when a company fetch fails', async () => {
    let callCount = 0
    server.use(
      http.get('https://api.lever.co/v0/postings/:slug', () => {
        callCount++
        if (callCount === 1) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json([])
      }),
    )

    const listings = await leverAdapter.fetchListings({
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    })

    expect(Array.isArray(listings)).toBe(true)
    expect(callCount).toBeGreaterThan(1)
  })
})

describe('LEVER_COMPANIES seed list', () => {
  it('should have unique slugs', () => {
    const slugs = LEVER_COMPANIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('should contain at least 15 companies', () => {
    expect(LEVER_COMPANIES.length).toBeGreaterThanOrEqual(15)
  })
})
