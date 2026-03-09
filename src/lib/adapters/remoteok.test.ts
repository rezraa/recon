import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { SourceError } from '@/lib/errors'
import { server } from '@/test-utils/msw/server'

import remoteokFixture from './__fixtures__/remoteok-response.json'
import { remoteokAdapter } from './remoteok'
import { rawJobListingSchema } from './types'

const defaultConfig = {
  preferences: { targetTitles: [], locations: [], remotePreference: null },
}

describe('remoteokAdapter', () => {
  it('should fetch and map listings correctly', async () => {
    // MSW returns fixture with metadata prepended
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([{ legal: 'metadata' }, ...remoteokFixture])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)

    expect(listings).toHaveLength(2)
    expect(listings[0].source_name).toBe('remoteok')
    expect(listings[0].external_id).toBe('remoteok-100001')
    expect(listings[0].title).toBe('Senior React Developer')
    expect(listings[0].company).toBe('Acme Corp')
    expect(listings[0].source_url).toBe('https://remoteok.com/remote-jobs/100001-senior-react-developer-acme-corp')
    expect(listings[0].apply_url).toBe('https://acme-corp.com/careers/apply/100001')
    expect(listings[0].salary_min).toBe(120000)
    expect(listings[0].salary_max).toBe(160000)
    expect(listings[0].location).toBe('Remote')
    expect(listings[0].is_remote).toBe(true)
  })

  it('should preserve raw_data byte-for-byte', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([{ legal: 'metadata' }, ...remoteokFixture])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings[0].raw_data).toEqual(remoteokFixture[0])
  })

  it('should skip the first metadata element', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([{ legal: 'metadata' }, remoteokFixture[0]])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings).toHaveLength(1)
    expect(listings[0].title).toBe('Senior React Developer')
  })

  it('should return empty array when response is empty array', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array when only metadata element exists', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([{ legal: 'metadata' }])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should handle listings with missing salary', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([{ legal: 'metadata' }, remoteokFixture[1]])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings[0].salary_min).toBeUndefined()
    expect(listings[0].salary_max).toBeUndefined()
  })

  it('should skip listings with empty description', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([
          { legal: 'metadata' },
          { ...remoteokFixture[0], description: '' },
        ])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('should return valid listings and skip invalid in mixed batch', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([
          { legal: 'metadata' },
          remoteokFixture[0],
          { ...remoteokFixture[1], description: '' }, // invalid — empty desc
        ])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings).toHaveLength(1)
    expect(listings[0].title).toBe('Senior React Developer')
    warnSpy.mockRestore()
  })

  /** @priority-1 */
  it('should pass Zod validation for all listings', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([{ legal: 'metadata' }, ...remoteokFixture])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  /** @priority-2 */
  it('should throw SourceError on timeout', async () => {
    // Timeout behavior is thoroughly tested in utils.test.ts with short timeouts.
    // Here we verify the adapter wraps timeout errors as SourceError.
    server.use(
      http.get('https://remoteok.com/api', async () => {
        // Simulate a response that takes too long by aborting
        const abortError = new Error('The operation was aborted')
        abortError.name = 'AbortError'
        throw abortError
      }),
    )

    await expect(remoteokAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  /** @priority-2 */
  it('should throw SourceError on HTTP 500', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return new HttpResponse(null, { status: 500 })
      }),
    )

    await expect(remoteokAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  it('should throw SourceError on malformed JSON', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return new HttpResponse('not json', {
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )

    await expect(remoteokAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  it('should handle non-array response gracefully', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json({ error: 'something went wrong' })
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should correctly infer is_remote three-state', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([{ legal: 'metadata' }, ...remoteokFixture])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    // "Remote" -> true
    expect(listings[0].is_remote).toBe(true)
    // "Worldwide" -> false (no "remote" in it)
    expect(listings[1].is_remote).toBe(false)
  })

  it('should strip HTML from description for description_text', async () => {
    server.use(
      http.get('https://remoteok.com/api', () => {
        return HttpResponse.json([
          { legal: 'metadata' },
          {
            ...remoteokFixture[0],
            description: '<p>Hello <b>World</b></p>',
          },
        ])
      }),
    )

    const listings = await remoteokAdapter.fetchListings(defaultConfig)
    expect(listings[0].description_text).toBe('Hello World')
    expect(listings[0].description_html).toBe('<p>Hello <b>World</b></p>')
  })
})
