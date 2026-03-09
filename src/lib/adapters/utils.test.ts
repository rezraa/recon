import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { SourceError } from '@/lib/errors'
import { server } from '@/test-utils/msw/server'

import {
  fetchWithTimeout,
  inferRemote,
  parseSalaryString,
  stripHtml,
  validateListings,
} from './utils'

// ─── stripHtml ─────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('should strip basic HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello')
  })

  it('should strip nested HTML tags', () => {
    expect(stripHtml('<div><p>Hello <b>World</b></p></div>')).toBe('Hello World')
  })

  it('should collapse whitespace', () => {
    expect(stripHtml('<p>Hello</p>   <p>World</p>')).toBe('Hello World')
  })

  it('should handle empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('should decode safe HTML entities', () => {
    expect(stripHtml('&amp; &quot; &#39;')).toBe('& " \'')
  })

  it('should preserve &lt; and &gt; as-is to prevent XSS', () => {
    expect(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('should handle &nbsp;', () => {
    expect(stripHtml('Hello&nbsp;World')).toBe('Hello World')
  })

  it('should handle self-closing tags', () => {
    expect(stripHtml('Hello<br/>World')).toBe('Hello World')
  })

  it('should handle list items', () => {
    expect(stripHtml('<ul><li>One</li><li>Two</li></ul>')).toBe('One Two')
  })

  it('should return plain text unchanged', () => {
    expect(stripHtml('No HTML here')).toBe('No HTML here')
  })
})

// ─── parseSalaryString ─────────────────────────────────────────────────────

describe('parseSalaryString', () => {
  it('should parse "$120,000 - $150,000/yr"', () => {
    expect(parseSalaryString('$120,000 - $150,000/yr')).toEqual({ min: 120000, max: 150000 })
  })

  it('should parse "$120k-$150k"', () => {
    expect(parseSalaryString('$120k-$150k')).toEqual({ min: 120000, max: 150000 })
  })

  it('should parse "$130,000 - $170,000"', () => {
    expect(parseSalaryString('$130,000 - $170,000')).toEqual({ min: 130000, max: 170000 })
  })

  it('should return empty for "Competitive"', () => {
    expect(parseSalaryString('Competitive')).toEqual({})
  })

  it('should handle numeric passthrough', () => {
    expect(parseSalaryString(130000)).toEqual({ min: 130000 })
  })

  it('should handle null', () => {
    expect(parseSalaryString(null)).toEqual({})
  })

  it('should handle undefined', () => {
    expect(parseSalaryString(undefined)).toEqual({})
  })

  it('should parse "$140,000 - $180,000 a year"', () => {
    expect(parseSalaryString('$140,000 - $180,000 a year')).toEqual({ min: 140000, max: 180000 })
  })

  it('should parse single value "$120k"', () => {
    expect(parseSalaryString('$120k')).toEqual({ min: 120000 })
  })

  it('should return empty for empty string', () => {
    expect(parseSalaryString('')).toEqual({})
  })
})

// ─── inferRemote ───────────────────────────────────────────────────────────

describe('inferRemote', () => {
  /** @priority-1 */
  it('should return true for "Remote"', () => {
    expect(inferRemote('Remote')).toBe(true)
  })

  /** @priority-1 */
  it('should return true for "Remote - US"', () => {
    expect(inferRemote('Remote - US')).toBe(true)
  })

  /** @priority-1 */
  it('should return false for "New York, NY"', () => {
    expect(inferRemote('New York, NY')).toBe(false)
  })

  /** @priority-1 */
  it('should return undefined for null', () => {
    expect(inferRemote(null)).toBeUndefined()
  })

  /** @priority-1 */
  it('should return undefined for undefined', () => {
    expect(inferRemote(undefined)).toBeUndefined()
  })

  it('should return true for "Anywhere (Remote)"', () => {
    expect(inferRemote('Anywhere (Remote)')).toBe(true)
  })

  it('should return false for "San Francisco, CA"', () => {
    expect(inferRemote('San Francisco, CA')).toBe(false)
  })

  it('should return true for case-insensitive "REMOTE"', () => {
    expect(inferRemote('REMOTE')).toBe(true)
  })

  /** @priority-1 */
  it('should return undefined for empty string', () => {
    expect(inferRemote('')).toBeUndefined()
  })
})

// ─── validateListings ──────────────────────────────────────────────────────

describe('validateListings', () => {
  const validListing = {
    source_name: 'test',
    external_id: 'test-1',
    title: 'Developer',
    company: 'TestCo',
    source_url: 'https://example.com/job/1',
    description_text: 'A great job',
    raw_data: { original: true },
  }

  /** @priority-1 */
  it('should return valid listings', () => {
    const result = validateListings([validListing], 'test')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Developer')
  })

  /** @priority-1 */
  it('should skip listings with empty description_text', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalid = { ...validListing, description_text: '' }
    const result = validateListings([invalid], 'test')
    expect(result).toHaveLength(0)
    warnSpy.mockRestore()
  })

  /** @priority-1 */
  it('should skip listings with missing required fields', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { title: _title, ...noTitle } = validListing
    const result = validateListings([noTitle], 'test')
    expect(result).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('should return mixed valid/invalid results', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalid = { ...validListing, description_text: '' }
    const result = validateListings([validListing, invalid, validListing], 'test')
    expect(result).toHaveLength(2)
    warnSpy.mockRestore()
  })

  it('should log warning with skip count', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalid = { ...validListing, description_text: '' }
    validateListings([invalid], 'test')
    expect(warnSpy).toHaveBeenCalledWith('[test] Skipped 1/1 invalid listings')
    warnSpy.mockRestore()
  })

  it('should not log when all listings are valid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    validateListings([validListing], 'test')
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('should handle empty array', () => {
    const result = validateListings([], 'test')
    expect(result).toHaveLength(0)
  })
})

// ─── fetchWithTimeout ──────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  /** @priority-2 */
  it('should fetch successfully within timeout', async () => {
    server.use(
      http.get('https://test-api.example.com/data', () => {
        return HttpResponse.json({ ok: true })
      }),
    )
    const response = await fetchWithTimeout('https://test-api.example.com/data')
    const data = await response.json()
    expect(data).toEqual({ ok: true })
  })

  /** @priority-2 */
  it('should throw SourceError with type timeout on abort', async () => {
    server.use(
      http.get('https://test-api.example.com/slow', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(
      fetchWithTimeout('https://test-api.example.com/slow', {}, 100),
    ).rejects.toThrow(SourceError)

    try {
      await fetchWithTimeout('https://test-api.example.com/slow', {}, 100)
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError)
      expect((error as SourceError).errorType).toBe('timeout')
    }
  })

  /** @priority-2 */
  it('should throw on HTTP 500 response', async () => {
    server.use(
      http.get('https://test-api.example.com/error', () => {
        return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
      }),
    )
    await expect(
      fetchWithTimeout('https://test-api.example.com/error'),
    ).rejects.toThrow('HTTP 500')
  })

  /** @priority-2 */
  it('should throw on HTTP 401 response', async () => {
    server.use(
      http.get('https://test-api.example.com/auth', () => {
        return new HttpResponse(null, { status: 401, statusText: 'Unauthorized' })
      }),
    )
    await expect(
      fetchWithTimeout('https://test-api.example.com/auth'),
    ).rejects.toThrow('HTTP 401')
  })

  /** @priority-2 */
  it('should throw on HTTP 429 response', async () => {
    server.use(
      http.get('https://test-api.example.com/rate', () => {
        return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' })
      }),
    )
    await expect(
      fetchWithTimeout('https://test-api.example.com/rate'),
    ).rejects.toThrow('HTTP 429')
  })

  it('should pass through request options', async () => {
    server.use(
      http.get('https://test-api.example.com/headers', ({ request }) => {
        const ua = request.headers.get('User-Agent')
        return HttpResponse.json({ userAgent: ua })
      }),
    )
    const response = await fetchWithTimeout('https://test-api.example.com/headers', {
      headers: { 'User-Agent': 'TestAgent/1.0' },
    })
    const data = await response.json()
    expect(data.userAgent).toBe('TestAgent/1.0')
  })
})
