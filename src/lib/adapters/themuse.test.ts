import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { SourceError } from '@/lib/errors'
import { server } from '@/test-utils/msw/server'

import themuseFixture from './__fixtures__/themuse-response.json'
import { themuseAdapter } from './themuse'
import { rawJobListingSchema } from './types'

const defaultConfig = {
  preferences: { targetTitles: [], locations: [], remotePreference: null },
}

function useDefaultHandler() {
  server.use(
    http.get('https://www.themuse.com/api/public/jobs', () => {
      return HttpResponse.json(themuseFixture)
    }),
  )
}

describe('themuseAdapter', () => {
  it('should fetch and map listings correctly', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)

    expect(listings).toHaveLength(2)
    expect(listings[0].source_name).toBe('themuse')
    expect(listings[0].external_id).toBe('themuse-300001')
    expect(listings[0].title).toBe('Frontend Engineer')
    expect(listings[0].company).toBe('Tech Solutions')
    expect(listings[0].source_url).toBe('https://www.themuse.com/jobs/tech-solutions/frontend-engineer-300001')
  })

  it('should strip HTML from contents for description_text', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings[0].description_text).not.toContain('<')
    expect(listings[0].description_text).toContain('Senior')
    expect(listings[0].description_text).toContain('React')
    expect(listings[0].description_html).toBe(themuseFixture.results[0].contents)
  })

  it('should have undefined salary (TheMuse has no salary data)', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings[0].salary_min).toBeUndefined()
    expect(listings[0].salary_max).toBeUndefined()
  })

  it('should preserve raw_data byte-for-byte', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings[0].raw_data).toEqual(themuseFixture.results[0])
  })

  it('should map location from locations[0].name', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings[0].location).toBe('New York, NY')
    expect(listings[1].location).toBe('Remote')
  })

  it('should infer is_remote correctly', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBe(false)  // "New York, NY"
    expect(listings[1].is_remote).toBe(true)   // "Remote"
  })

  it('should set is_remote undefined when no locations', async () => {
    server.use(
      http.get('https://www.themuse.com/api/public/jobs', () => {
        return HttpResponse.json({
          results: [{
            ...themuseFixture.results[0],
            locations: [],
          }],
          page: 1,
          page_count: 1,
          total: 1,
        })
      }),
    )

    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBeUndefined()
    expect(listings[0].location).toBeUndefined()
  })

  it('should return empty array when results key is missing', async () => {
    server.use(
      http.get('https://www.themuse.com/api/public/jobs', () => {
        return HttpResponse.json({ page: 1, page_count: 0 })
      }),
    )

    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array for error response', async () => {
    server.use(
      http.get('https://www.themuse.com/api/public/jobs', () => {
        return HttpResponse.json({ error: 'rate limited' })
      }),
    )

    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array for empty results', async () => {
    server.use(
      http.get('https://www.themuse.com/api/public/jobs', () => {
        return HttpResponse.json({ results: [], page: 1, page_count: 0, total: 0 })
      }),
    )

    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should skip listings with empty description', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get('https://www.themuse.com/api/public/jobs', () => {
        return HttpResponse.json({
          results: [{ ...themuseFixture.results[0], contents: '' }],
          page: 1,
          page_count: 1,
          total: 1,
        })
      }),
    )

    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings).toHaveLength(0)
    warnSpy.mockRestore()
  })

  /** @priority-1 */
  it('should pass Zod validation for all listings', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)
    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  /** @priority-2 */
  it('should throw SourceError on HTTP 500', async () => {
    server.use(
      http.get('https://www.themuse.com/api/public/jobs', () => {
        return new HttpResponse(null, { status: 500 })
      }),
    )

    await expect(themuseAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  /** @priority-2 */
  it('should throw SourceError on HTTP 403 (rate limit)', async () => {
    server.use(
      http.get('https://www.themuse.com/api/public/jobs', () => {
        return new HttpResponse(null, { status: 403 })
      }),
    )

    await expect(themuseAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  it('should use landing_page URL for source_url', async () => {
    useDefaultHandler()
    const listings = await themuseAdapter.fetchListings(defaultConfig)
    expect(listings[0].source_url).toBe(themuseFixture.results[0].refs.landing_page)
  })
})
