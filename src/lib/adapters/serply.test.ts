import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { SourceError } from '@/lib/errors'
import { server } from '@/test-utils/msw/server'

import serplyFixture from './__fixtures__/serply-response.json'
import { serplyAdapter } from './serply'
import { rawJobListingSchema } from './types'

const defaultConfig = {
  apiKey: 'test-api-key',
  preferences: { targetTitles: ['software engineer'], locations: ['Remote'], remotePreference: null },
}

function useDefaultHandler() {
  server.use(
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

describe('serplyAdapter', () => {
  it('should fetch and map listings correctly', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)

    expect(listings).toHaveLength(2)
    expect(listings[0].source_name).toBe('serply')
    expect(listings[0].external_id).toBe('serply-serply-500001')
    expect(listings[0].title).toBe('Software Engineer')
    expect(listings[0].company).toBe('MegaCorp')
    expect(listings[0].source_url).toBe('https://example.com/jobs/500001')
    expect(listings[0].apply_url).toBe('https://megacorp.com/apply/500001')
  })

  it('should parse salary from detected_extensions', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings[0].salary_min).toBe(140000)
    expect(listings[0].salary_max).toBe(180000)
  })

  it('should handle "Competitive" salary as undefined', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings[1].salary_min).toBeUndefined()
    expect(listings[1].salary_max).toBeUndefined()
  })

  it('should preserve raw_data byte-for-byte', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings[0].raw_data).toEqual(serplyFixture.jobs[0])
  })

  it('should use description as description_html when available', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings[0].description_html).toBe(serplyFixture.jobs[0].description)
  })

  it('should derive description_text from description', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings[0].description_text).toBeTruthy()
    expect(listings[0].description_text.length).toBeGreaterThan(0)
  })

  it('should infer is_remote correctly', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings[0].is_remote).toBe(true)   // "Remote - US"
    expect(listings[1].is_remote).toBe(false)   // "San Francisco, CA"
  })

  it('should pass API key via X-Api-Key header', async () => {
    let capturedKey: string | null = null
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', ({ request }) => {
        capturedKey = request.headers.get('X-Api-Key')
        return HttpResponse.json(serplyFixture, {
          headers: {
            'X-RateLimit-Remaining': '8',
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z',
          },
        })
      }),
    )

    await serplyAdapter.fetchListings(defaultConfig)
    expect(capturedKey).toBe('test-api-key')
  })

  it('should throw SourceError when no API key provided', async () => {
    const noKeyConfig = {
      preferences: { targetTitles: [], locations: [], remotePreference: null },
    }

    await expect(serplyAdapter.fetchListings(noKeyConfig)).rejects.toThrow(SourceError)
    try {
      await serplyAdapter.fetchListings(noKeyConfig)
    } catch (error) {
      expect((error as SourceError).errorType).toBe('auth_error')
    }
  })

  it('should build query from preferences', async () => {
    let capturedUrl = ''
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json(serplyFixture, {
          headers: {
            'X-RateLimit-Remaining': '8',
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z',
          },
        })
      }),
    )

    await serplyAdapter.fetchListings(defaultConfig)
    expect(capturedUrl).toContain('software')
    expect(capturedUrl).toContain('Remote')
  })

  it('should update rate limit status from response headers', async () => {
    useDefaultHandler()
    await serplyAdapter.fetchListings(defaultConfig)

    const status = serplyAdapter.getRateLimitStatus!()
    expect(status).not.toBeNull()
    expect(status!.remaining).toBe(8)
    expect(status!.resetsAt).toBeInstanceOf(Date)
  })

  it.skip('should return null rate limit status before any fetch', async () => {
    // Module-level state persists across tests in the same file.
    // Rate limit status is tested via the update tests above.
    // A fresh-module test would require module re-import (vi.resetModules).
  })

  it('should return empty array when jobs key is missing', async () => {
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return HttpResponse.json({ metadata: {} }, {
          headers: { 'X-RateLimit-Remaining': '8', 'X-RateLimit-Limit': '10', 'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z' },
        })
      }),
    )

    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should return empty array for empty jobs array', async () => {
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return HttpResponse.json({ jobs: [] }, {
          headers: { 'X-RateLimit-Remaining': '8', 'X-RateLimit-Limit': '10', 'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z' },
        })
      }),
    )

    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings).toEqual([])
  })

  it('should skip listings with empty description', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return HttpResponse.json({
          jobs: [{ ...serplyFixture.jobs[0], description: '', snippet: '' }],
        }, {
          headers: { 'X-RateLimit-Remaining': '8', 'X-RateLimit-Limit': '10', 'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z' },
        })
      }),
    )

    const listings = await serplyAdapter.fetchListings(defaultConfig)
    expect(listings).toHaveLength(0)
    warnSpy.mockRestore()
  })

  /** @priority-1 */
  it('should pass Zod validation for all listings', async () => {
    useDefaultHandler()
    const listings = await serplyAdapter.fetchListings(defaultConfig)
    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  /** @priority-2 */
  it('should throw SourceError with auth_error on HTTP 401', async () => {
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return new HttpResponse(null, { status: 401 })
      }),
    )

    try {
      await serplyAdapter.fetchListings(defaultConfig)
      expect.unreachable('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError)
      expect((error as SourceError).errorType).toBe('auth_error')
    }
  })

  /** @priority-2 */
  it('should throw SourceError with auth_error on HTTP 403', async () => {
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return new HttpResponse(null, { status: 403 })
      }),
    )

    try {
      await serplyAdapter.fetchListings(defaultConfig)
      expect.unreachable('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError)
      expect((error as SourceError).errorType).toBe('auth_error')
    }
  })

  /** @priority-2 */
  it('should throw SourceError with rate_limit on HTTP 429', async () => {
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return new HttpResponse(null, {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '2024-03-09T01:00:00.000Z',
          },
        })
      }),
    )

    try {
      await serplyAdapter.fetchListings(defaultConfig)
      expect.unreachable('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError)
      expect((error as SourceError).errorType).toBe('rate_limit')
    }
  })

  it('should update rate limit status from 429 response headers', async () => {
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return new HttpResponse(null, {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '2024-03-09T01:00:00.000Z',
          },
        })
      }),
    )

    try {
      await serplyAdapter.fetchListings(defaultConfig)
    } catch {
      // Expected to throw
    }

    const status = serplyAdapter.getRateLimitStatus!()
    expect(status).not.toBeNull()
    expect(status!.remaining).toBe(0)
  })

  /** @priority-2 */
  it('should throw SourceError on HTTP 500', async () => {
    server.use(
      http.get('https://api.serply.io/v1/job/search/*', () => {
        return new HttpResponse(null, { status: 500 })
      }),
    )

    await expect(serplyAdapter.fetchListings(defaultConfig)).rejects.toThrow(SourceError)
  })

  describe('validateKey', () => {
    it('should return true for valid key (200)', async () => {
      server.use(
        http.get('https://api.serply.io/v1/job/search/*', () => {
          return HttpResponse.json({ jobs: [] })
        }),
      )

      const result = await serplyAdapter.validateKey!('valid-key')
      expect(result).toBe(true)
    })

    it('should return false for invalid key (401)', async () => {
      server.use(
        http.get('https://api.serply.io/v1/job/search/*', () => {
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const result = await serplyAdapter.validateKey!('invalid-key')
      expect(result).toBe(false)
    })

    it('should return false for forbidden key (403)', async () => {
      server.use(
        http.get('https://api.serply.io/v1/job/search/*', () => {
          return new HttpResponse(null, { status: 403 })
        }),
      )

      const result = await serplyAdapter.validateKey!('forbidden-key')
      expect(result).toBe(false)
    })
  })
})
