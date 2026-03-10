import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest'

import {
  _resetCacheFor,
  _resetSeedCache,
  _resetThrottle,
  _setRedis,
  type CompanyIntel,
  extractFunding,
  extractGrowth,
  extractNews,
  extractRating,
  extractSize,
  extractTechStackFromDescription,
  getCompanyIntel,
  normalizeCompanyName,
  searxQuery,
} from './company-intel'

// ─── Regex Parser Tests ────────────────────────────────────────────────────

describe('company-intel: extractRating', () => {
  it('extracts "X.X / 5" format', () => {
    expect(extractRating('Vercel has a 4.4 out of 5 rating on Glassdoor')).toBe('4.4 / 5.0')
  })

  it('extracts "X.X/5" format', () => {
    expect(extractRating('overall rating of 3.9/5 based on reviews')).toBe('3.9 / 5.0')
  })

  it('extracts "overall rating" format', () => {
    expect(extractRating('The overall rating is 4.1 with 2000 reviews')).toBe('4.1 / 5.0')
  })

  it('returns Unknown for no match', () => {
    expect(extractRating('No rating information available')).toBe('Unknown')
  })

  it('returns Unknown for empty text', () => {
    expect(extractRating('')).toBe('Unknown')
  })
})

describe('company-intel: extractSize', () => {
  it('extracts range format "501-1,000 employees"', () => {
    expect(extractSize('Company has 501-1,000 employees globally')).toBe('501-1,000 employees')
  })

  it('extracts "10,001+ employees"', () => {
    expect(extractSize('Google has 10,001+ employees')).toBe('10,001+ employees')
  })

  it('extracts "N people work" format', () => {
    expect(extractSize('About 800 people work at the company')).toBe('800 employees')
  })

  it('extracts "has N employees" format', () => {
    expect(extractSize('The company has 5,000 employees worldwide')).toBe('5,000 employees')
  })

  it('returns Unknown for no match', () => {
    expect(extractSize('No size information')).toBe('Unknown')
  })
})

describe('company-intel: extractFunding', () => {
  it('extracts total funding with rounds', () => {
    expect(extractFunding('Total funding of $863M over 6 rounds')).toBe('$863M (6 rounds)')
  })

  it('extracts total funding without rounds', () => {
    expect(extractFunding('Funding $500M in total')).toBe('$500M')
  })

  it('extracts Series round', () => {
    expect(extractFunding('Completed Series F $50 billion in funding')).toBe('Series F ($50B)')
  })

  it('extracts "raised" format', () => {
    expect(extractFunding('The company raised $300 million in its latest round')).toBe('$300M raised')
  })

  it('detects public company', () => {
    expect(extractFunding('Google is publicly traded on NASDAQ')).toBe('Public')
  })

  it('returns Unknown for no match', () => {
    expect(extractFunding('No funding details available')).toBe('Unknown')
  })
})

describe('company-intel: extractTechStackFromDescription', () => {
  it('extracts common tech terms from job description', () => {
    const desc = 'We use React, TypeScript, and Node.js with PostgreSQL and Docker'
    const result = extractTechStackFromDescription(desc)
    expect(result).toContain('React')
    expect(result).toContain('TypeScript')
    expect(result).toContain('Node.js')
  })

  it('returns Unknown for text with no tech terms', () => {
    expect(extractTechStackFromDescription('We are looking for a great team player')).toBe('Unknown')
  })

  it('caps at 8 tech terms', () => {
    const desc = 'React TypeScript Node.js PostgreSQL Docker Kubernetes AWS Terraform Python Java Ruby Rust'
    const result = extractTechStackFromDescription(desc)
    const terms = result.split(', ')
    expect(terms.length).toBeLessThanOrEqual(8)
  })

  it('handles empty description', () => {
    expect(extractTechStackFromDescription('')).toBe('Unknown')
  })

  it('handles undefined description', () => {
    expect(extractTechStackFromDescription(undefined)).toBe('Unknown')
  })
})

describe('company-intel: extractGrowth', () => {
  it('extracts revenue growth pattern', () => {
    const text = 'Revenue grew from $1B to $2B in the last year'
    const result = extractGrowth(text)
    expect(result).not.toBe('Unknown')
    expect(result).toContain('$')
  })

  it('extracts ARR pattern', () => {
    const text = 'ARR of $500M and growing rapidly'
    const result = extractGrowth(text)
    expect(result).not.toBe('Unknown')
  })

  it('extracts percentage growth', () => {
    const text = 'Achieved 45% growth YoY in 2025'
    const result = extractGrowth(text)
    expect(result).not.toBe('Unknown')
  })

  it('returns Unknown for no match', () => {
    expect(extractGrowth('Just a regular company')).toBe('Unknown')
  })
})

describe('company-intel: extractNews', () => {
  it('extracts "launched" news', () => {
    const text = 'The company launched a new AI platform for developers'
    const result = extractNews(text)
    expect(result).toContain('launched')
  })

  it('extracts "raised" news', () => {
    const text = 'Stripe raised $6.5 billion in a new funding round'
    const result = extractNews(text)
    expect(result).toContain('raised')
  })

  it('extracts valuation news', () => {
    const text = 'The round, valuing the company at $50 billion, was led by Sequoia'
    const result = extractNews(text)
    expect(result).not.toBe('Unknown')
  })

  it('returns Unknown for no match', () => {
    expect(extractNews('Nothing newsworthy here')).toBe('Unknown')
  })

  it('truncates long news to 100 chars', () => {
    const longText = 'launched ' + 'a'.repeat(200) + ' something great'
    const result = extractNews(longText)
    expect(result.length).toBeLessThanOrEqual(100)
  })
})

// ─── Company Name Normalization ────────────────────────────────────────────

describe('company-intel: normalizeCompanyName', () => {
  it('lowercases and trims', () => {
    expect(normalizeCompanyName('  Google  ')).toBe('google')
  })

  it('handles mixed case', () => {
    expect(normalizeCompanyName('Acme Corp')).toBe('acme corp')
  })

  it('normalizes whitespace', () => {
    expect(normalizeCompanyName('some   company   name')).toBe('some company name')
  })
})

// ─── Rate Limiter Tests ────────────────────────────────────────────────────

describe('company-intel: rate limiter', () => {
  beforeEach(() => {
    _resetThrottle(50) // 50ms for fast tests
  })

  afterEach(() => {
    _resetThrottle() // restore defaults
  })

  it('throttle helper is exposed for testing', () => {
    expect(typeof _resetThrottle).toBe('function')
  })

  it('spaces sequential searxQuery calls by rate limit interval', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    } as Response)

    const start = Date.now()
    await searxQuery('query1')
    await searxQuery('query2')
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(40) // ~50ms minus timing jitter
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    fetchSpy.mockRestore()
  })
})

// ─── Cache Layer Tests ────────────────────────────────────────────────────

describe('company-intel: cache layer', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
  }
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _setRedis(mockRedis as never)
    _resetThrottle(0)
    _resetSeedCache()
  })

  afterEach(() => {
    _setRedis(null)
    fetchSpy?.mockRestore()
  })

  it('returns cached result on cache hit', async () => {
    const cached: CompanyIntel = {
      glassdoorRating: '4.5 / 5.0',
      companySize: '1,000 employees',
      funding: '$500M',
      techStack: 'React, Node.js',
      growth: 'Revenue $100M',
      recentNews: 'launched AI product',
      fetchedAt: new Date('2026-03-01'),
    }
    mockRedis.get.mockResolvedValue(JSON.stringify(cached))

    const result = await getCompanyIntel('TestCorp')

    expect(mockRedis.get).toHaveBeenCalledWith('company-intel:testcorp')
    expect(result.glassdoorRating).toBe('4.5 / 5.0')
    expect(result.companySize).toBe('1,000 employees')
  })

  it('overrides tech stack from job description on cache hit', async () => {
    const cached: CompanyIntel = {
      glassdoorRating: '4.0 / 5.0',
      companySize: '500 employees',
      funding: 'Unknown',
      techStack: 'Unknown',
      growth: 'Unknown',
      recentNews: 'Unknown',
      fetchedAt: new Date('2026-03-01'),
    }
    mockRedis.get.mockResolvedValue(JSON.stringify(cached))

    const result = await getCompanyIntel('TestCorp', 'We use React and TypeScript with Docker')

    expect(result.techStack).toContain('React')
    expect(result.techStack).toContain('TypeScript')
  })

  it('returns Unknown fields when cache miss and SearXNG fails', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection refused'))

    const result = await getCompanyIntel('UnknownCorp')

    expect(result.glassdoorRating).toBe('Unknown')
    expect(result.companySize).toBe('Unknown')
    expect(result.funding).toBe('Unknown')
    expect(result.growth).toBe('Unknown')
    expect(result.recentNews).toBe('Unknown')
  })

  it('caches Unknown fallback with short TTL', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection refused'))

    await getCompanyIntel('UnknownCorp')

    // Should cache the Unknown result with 1-hour TTL (3600s)
    expect(mockRedis.set).toHaveBeenCalled()
    const setCall = mockRedis.set.mock.calls[0]
    expect(setCall[0]).toBe('company-intel:unknowncorp')
    expect(setCall[2]).toBe('EX')
    expect(setCall[3]).toBe(3600)
  })

  it('caches SearXNG results on success', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { title: 'Glassdoor', content: 'Rating 4.2 out of 5 based on 500 reviews' },
          { title: 'Company Info', content: 'Has 2,000 employees worldwide' },
        ],
      }),
    } as Response)

    const result = await getCompanyIntel('SomeCorp')
    expect(result.glassdoorRating).not.toBe('Unknown')
    expect(mockRedis.set).toHaveBeenCalled()
    const setCall = mockRedis.set.mock.calls[0]
    expect(setCall[0]).toBe('company-intel:somecorp')
    expect(setCall[2]).toBe('EX')
  })
})

// ─── Seed File Tests ────────────────────────────────────────────────────────

describe('company-intel: seed file fallback', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
  }
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _setRedis(mockRedis as never)
    _resetThrottle(0)
    _resetSeedCache()
  })

  afterEach(() => {
    _setRedis(null)
    fetchSpy?.mockRestore()
  })

  it('returns seed data for known companies when cache misses', async () => {
    mockRedis.get.mockResolvedValue(null) // cache miss
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('down'))

    const result = await getCompanyIntel('Google')

    // Google is in seed file
    expect(result.glassdoorRating).not.toBe('Unknown')
    expect(result.companySize).not.toBe('Unknown')
    expect(result.funding).toBe('Public')

    // Should cache the seed result in Redis
    expect(mockRedis.set).toHaveBeenCalled()
  })

  it('returns Unknown for companies not in seed file when SearXNG is down', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('down'))

    const result = await getCompanyIntel('TotallyUnknownStartupXYZ')

    expect(result.glassdoorRating).toBe('Unknown')
    expect(result.companySize).toBe('Unknown')
  })

  it('invalidates seed entries older than 90 days', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('down'))

    // Mock Date.now to make seed data appear 91 days old
    // Seed file uses seeded_at: "2026-03-01", so set "now" to 91 days later
    const seedDate = new Date('2026-03-01')
    const ninetyOneDaysLater = seedDate.getTime() + 91 * 24 * 60 * 60 * 1000
    const originalDateNow = Date.now
    Date.now = vi.fn().mockReturnValue(ninetyOneDaysLater)

    _resetSeedCache() // force reload with mocked time
    const result = await getCompanyIntel('Google') // Google is in seed

    // Seed should be invalidated — falls through to SearXNG (mocked down) → Unknown
    expect(result.glassdoorRating).toBe('Unknown')

    Date.now = originalDateNow
  })
})

// ─── Fallback Chain Tests ──────────────────────────────────────────────────

describe('company-intel: fallback chain', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
  }
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _setRedis(mockRedis as never)
    _resetThrottle(0)
    _resetSeedCache()
  })

  afterEach(() => {
    _setRedis(null)
    fetchSpy?.mockRestore()
  })

  it('follows cache → seed → SearXNG → Unknown order', async () => {
    // Cache miss
    mockRedis.get.mockResolvedValue(null)
    // SearXNG down
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('down'))

    const result = await getCompanyIntel('RandomStartup')

    // Should have tried cache first
    expect(mockRedis.get).toHaveBeenCalledTimes(1)
    // Should return Unknown (no seed, no SearXNG)
    expect(result.glassdoorRating).toBe('Unknown')
  })

  it('tech stack always extracted from job description regardless of source', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('down'))

    const result = await getCompanyIntel('TestCorp', 'Looking for Python and Django developers')

    expect(result.techStack).toContain('Python')
    expect(result.techStack).toContain('Django')
  })
})

// ─── Cache Bust Tests ────────────────────────────────────────────────────────

describe('company-intel: cache bust (_resetCacheFor)', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  }

  beforeEach(() => {
    vi.resetAllMocks()
    _setRedis(mockRedis as never)
    _resetThrottle(0)
    _resetSeedCache()
  })

  afterEach(() => {
    _setRedis(null)
  })

  it('deletes the Redis cache key for the given company', async () => {
    mockRedis.del.mockResolvedValue(1)

    await _resetCacheFor('TestCorp')

    expect(mockRedis.del).toHaveBeenCalledWith('company-intel:testcorp')
  })

  it('normalizes company name when deleting cache', async () => {
    mockRedis.del.mockResolvedValue(1)

    await _resetCacheFor('  Some  Company  ')

    expect(mockRedis.del).toHaveBeenCalledWith('company-intel:some company')
  })

  it('does not throw when Redis delete fails', async () => {
    mockRedis.del.mockRejectedValue(new Error('Redis down'))

    // Should not throw
    await expect(_resetCacheFor('TestCorp')).resolves.toBeUndefined()
  })
})

// ─── Redis TTL Verification Tests ────────────────────────────────────────────

describe('company-intel: Redis TTL behavior', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
  }
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    _setRedis(mockRedis as never)
    _resetThrottle(0)
    _resetSeedCache()
  })

  afterEach(() => {
    _setRedis(null)
    fetchSpy?.mockRestore()
  })

  it('sets 7-day TTL for successful SearXNG results', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { title: 'Glassdoor', content: 'Rating 4.2 out of 5' },
        ],
      }),
    } as Response)

    await getCompanyIntel('SomeCorp')

    const setCall = mockRedis.set.mock.calls[0]
    expect(setCall[2]).toBe('EX')
    expect(setCall[3]).toBe(7 * 24 * 60 * 60) // 604800 seconds
  })

  it('sets 1-hour TTL for Unknown fallback results', async () => {
    mockRedis.get.mockResolvedValue(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('down'))

    await getCompanyIntel('UnknownCorp')

    const setCall = mockRedis.set.mock.calls[0]
    expect(setCall[2]).toBe('EX')
    expect(setCall[3]).toBe(3600) // 1 hour
  })

  it('sets 7-day TTL for seed file results cached in Redis', async () => {
    mockRedis.get.mockResolvedValue(null)
    // Don't need fetch mock — seed file hit won't reach SearXNG

    await getCompanyIntel('Google') // Google is in seed file

    const setCall = mockRedis.set.mock.calls[0]
    expect(setCall[2]).toBe('EX')
    expect(setCall[3]).toBe(7 * 24 * 60 * 60)
  })

  it('re-fetches after cache bust (get returns null after del)', async () => {
    // First call: cache hit
    const cached: CompanyIntel = {
      glassdoorRating: '3.0 / 5.0',
      companySize: 'Unknown',
      funding: 'Unknown',
      techStack: 'Unknown',
      growth: 'Unknown',
      recentNews: 'Unknown',
      fetchedAt: new Date('2026-03-01'),
    }
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(cached))

    const first = await getCompanyIntel('TestCorp')
    expect(first.glassdoorRating).toBe('3.0 / 5.0')

    // Simulate cache bust: next get returns null
    mockRedis.get.mockResolvedValueOnce(null)
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { title: 'Glassdoor', content: 'Rating 4.5 out of 5' },
        ],
      }),
    } as Response)

    const refreshed = await getCompanyIntel('TestCorp')
    expect(refreshed.glassdoorRating).toBe('4.5 / 5.0')
    expect(mockRedis.set).toHaveBeenCalled() // re-cached
  })
})
