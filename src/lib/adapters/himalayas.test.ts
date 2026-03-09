import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { SourceError } from '@/lib/errors'
import { server } from '@/test-utils/msw/server'

import himalayasLegacyFixture from './__fixtures__/himalayas-legacy-response.json'
import himalayasFixture from './__fixtures__/himalayas-response.json'
import { himalayasAdapter } from './himalayas'
import { rawJobListingSchema } from './types'

const defaultConfig = {
  preferences: { targetTitles: [], locations: [], remotePreference: null },
}

function useDefaultHandler() {
  server.use(
    http.get('https://himalayas.app/jobs/api', () => {
      return HttpResponse.json(himalayasFixture)
    }),
  )
}

describe('himalayasAdapter', () => {
  it('should fetch and map listings correctly', async () => {
    useDefaultHandler()
    const listings = await himalayasAdapter.fetchListings(defaultConfig)

    expect(listings).toHaveLength(2)
    expect(listings[0].source_name).toBe('himalayas')
    expect(listings[0].external_id).toBe('himalayas-200001')
    expect(listings[0].title).toBe('Senior React Developer')
    expect(listings[0].company).toBe('Google LLC')
    expect(listings[0].source_url).toBe('https://himalayas.app/jobs/200001')
  })

  it('should use numeric minSalary/maxSalary from fixture', async () => {
    useDefaultHandler()
    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].salary_min).toBe(130000)
    expect(listings[0].salary_max).toBe(170000)
    expect(listings[1].salary_min).toBe(120000)
    expect(listings[1].salary_max).toBe(150000)
  })

  it('should prefer numeric minSalary/maxSalary over string salary', async () => {
    useDefaultHandler()
    // Default fixture has both numeric and string — numeric should be preferred
    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].salary_min).toBe(130000)
    expect(listings[0].salary_max).toBe(170000)
  })

  it('should parse legacy string salary when numeric fields absent', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json(himalayasLegacyFixture)
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].salary_min).toBe(130000)
    expect(listings[0].salary_max).toBe(170000)
    expect(listings[1].salary_min).toBe(120000)
    expect(listings[1].salary_max).toBe(150000)
  })

  it('should preserve raw_data byte-for-byte', async () => {
    useDefaultHandler()
    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].raw_data).toEqual(himalayasFixture.jobs[0])
  })

  it('should map location from locationRestrictions[0]', async () => {
    useDefaultHandler()
    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].location).toBe('Remote - US')
    expect(listings[1].location).toBe('NYC')
  })

  it('should infer is_remote from location', async () => {
    useDefaultHandler()
    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBe(true)  // "Remote - US"
    expect(listings[1].is_remote).toBe(false)  // "NYC"
  })

  it('should return undefined is_remote when locationRestrictions is empty', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({
          jobs: [{
            ...himalayasFixture.jobs[0],
            locationRestrictions: [],
          }],
          totalCount: 1,
          offset: 0,
          limit: 5,
        })
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBeUndefined()
    expect(listings[0].location).toBeUndefined()
  })

  it('should strip HTML from description', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({
          jobs: [{
            ...himalayasFixture.jobs[0],
            description: '<p>Hello <b>World</b></p>',
          }],
          totalCount: 1,
          offset: 0,
          limit: 5,
        })
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].description_text).toBe('Hello World')
    expect(listings[0].description_html).toBe('<p>Hello <b>World</b></p>')
  })

  it('should return empty array when jobs key is missing', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({ totalCount: 0 })
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array for error response object', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({ error: 'something went wrong' })
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array for empty jobs array', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({ jobs: [], totalCount: 0 })
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should skip listings with empty description', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({
          jobs: [{ ...himalayasFixture.jobs[0], description: '' }],
          totalCount: 1,
          offset: 0,
          limit: 5,
        })
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings).toHaveLength(0)
    warnSpy.mockRestore()
  })

  /** @priority-1 */
  it('should pass Zod validation for all listings', async () => {
    useDefaultHandler()
    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  /** @priority-2 */
  it('should throw SourceError on HTTP 500', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return new HttpResponse(null, { status: 500 })
      }),
    )

    await expect(himalayasAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  it('should use guid for external_id when available', async () => {
    server.use(
      http.get('https://himalayas.app/jobs/api', () => {
        return HttpResponse.json({
          jobs: [{
            ...himalayasFixture.jobs[0],
            guid: 'unique-guid-123',
          }],
          totalCount: 1,
          offset: 0,
          limit: 5,
        })
      }),
    )

    const listings = await himalayasAdapter.fetchListings(defaultConfig)
    expect(listings[0].external_id).toBe('himalayas-unique-guid-123')
  })
})
