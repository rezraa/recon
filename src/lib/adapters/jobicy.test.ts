import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { SourceError } from '@/lib/errors'
import { server } from '@/test-utils/msw/server'

import jobicyFixture from './__fixtures__/jobicy-response.json'
import { jobicyAdapter } from './jobicy'
import { rawJobListingSchema } from './types'

const defaultConfig = {
  preferences: { targetTitles: [], locations: [], remotePreference: null },
}

function useDefaultHandler() {
  server.use(
    http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return HttpResponse.json(jobicyFixture)
    }),
  )
}

describe('jobicyAdapter', () => {
  it('should fetch and map listings correctly', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)

    expect(listings).toHaveLength(2)
    expect(listings[0].source_name).toBe('jobicy')
    expect(listings[0].external_id).toBe('jobicy-400001')
    expect(listings[0].title).toBe('DevOps Engineer')
    expect(listings[0].company).toBe('CloudFirst')
    expect(listings[0].source_url).toBe('https://jobicy.com/jobs/400001-devops-engineer')
  })

  it('should map salary from annualSalaryMin/annualSalaryMax', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].salary_min).toBe(110000)
    expect(listings[0].salary_max).toBe(145000)
  })

  it('should have undefined salary when not provided', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[1].salary_min).toBeUndefined()
    expect(listings[1].salary_max).toBeUndefined()
  })

  it('should preserve raw_data byte-for-byte', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].raw_data).toEqual(jobicyFixture.jobs[0])
  })

  it('should use jobExcerpt for description when no jobDescription', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].description_text).toBe(jobicyFixture.jobs[0].jobExcerpt)
  })

  it('should prefer jobDescription over jobExcerpt when both exist', async () => {
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        return HttpResponse.json({
          jobs: [{
            ...jobicyFixture.jobs[0],
            jobDescription: '<p>Full <b>HTML</b> description</p>',
            jobExcerpt: 'Short excerpt',
          }],
          totalCount: 1,
        })
      }),
    )

    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].description_text).toBe('Full HTML description')
    expect(listings[0].description_html).toBe('<p>Full <b>HTML</b> description</p>')
  })

  it('should infer is_remote correctly', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBe(true)   // "Remote"
    expect(listings[1].is_remote).toBe(false)   // "New York, NY"
  })

  it('should infer is_remote true for "Anywhere"', async () => {
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        return HttpResponse.json({
          jobs: [{ ...jobicyFixture.jobs[0], jobGeo: 'Anywhere' }],
          totalCount: 1,
        })
      }),
    )

    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBe(true)
  })

  it('should return undefined is_remote when jobGeo is absent', async () => {
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        const { jobGeo: _jobGeo, ...noGeo } = jobicyFixture.jobs[0] as Record<string, unknown>
        return HttpResponse.json({
          jobs: [noGeo],
          totalCount: 1,
        })
      }),
    )

    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBeUndefined()
  })

  it('should return empty array when jobs key is missing', async () => {
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        return HttpResponse.json({ totalCount: 0 })
      }),
    )

    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array for error response', async () => {
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        return HttpResponse.json({ error: 'rate limited' })
      }),
    )

    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array for empty jobs array', async () => {
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        return HttpResponse.json({ jobs: [], totalCount: 0 })
      }),
    )

    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should skip listings with empty description', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        return HttpResponse.json({
          jobs: [{ ...jobicyFixture.jobs[0], jobExcerpt: '', jobDescription: undefined }],
          totalCount: 1,
        })
      }),
    )

    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings).toHaveLength(0)
    warnSpy.mockRestore()
  })

  /** @priority-1 */
  it('should pass Zod validation for all listings', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  /** @priority-2 */
  it('should throw SourceError on HTTP 500', async () => {
    server.use(
      http.get('https://jobicy.com/api/v2/remote-jobs', () => {
        return new HttpResponse(null, { status: 500 })
      }),
    )

    await expect(jobicyAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  it('should map location from jobGeo', async () => {
    useDefaultHandler()
    const listings = await jobicyAdapter.fetchListings(defaultConfig)
    expect(listings[0].location).toBe('Remote')
    expect(listings[1].location).toBe('New York, NY')
  })
})
