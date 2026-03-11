import fs from 'fs'
import path from 'path'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/test-utils/msw/server'

import { rawJobListingSchema } from './types'
import { extractCompanyFromTitle, getFeedUrls, rssAdapter, setFeedUrls } from './rss'

// ─── Fixtures ─────────────────────────────────────────────────────────────

const rssFeedXml = fs.readFileSync(
  path.join(__dirname, '__fixtures__', 'rss-feed.xml'),
  'utf-8',
)

const atomFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Job Feed</title>
  <entry>
    <title>Backend Engineer at Shopify</title>
    <link href="https://example.com/atom/1" />
    <summary>Build APIs with Ruby and Go. $130,000 - $170,000.</summary>
    <published>2026-03-10T00:00:00Z</published>
    <id>atom-job-1</id>
    <author><name>Shopify</name></author>
  </entry>
</feed>`

// ─── Setup ────────────────────────────────────────────────────────────────

const FEED_URL = 'https://feeds.example.com/jobs.rss'
const ATOM_URL = 'https://feeds.example.com/jobs.atom'

const defaultConfig = {
  preferences: { targetTitles: [], locations: [], remotePreference: null },
}

beforeEach(() => {
  setFeedUrls([FEED_URL])
  server.use(
    http.get(FEED_URL, () => {
      return new HttpResponse(rssFeedXml, {
        headers: { 'Content-Type': 'application/xml' },
      })
    }),
  )
})

afterEach(() => {
  setFeedUrls([])
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('rssAdapter', () => {
  describe('fetchListings', () => {
    it('[P1] should fetch and parse RSS feed items', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings.length).toBe(3)
    })

    it('[P1] should extract title and company from "Title at Company" pattern', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const google = listings.find((l) => l.company === 'Google')
      expect(google).toBeDefined()
      expect(google!.title).toBe('Senior Software Engineer')
    })

    it('[P1] should extract title and company from "Title - Company" pattern', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const stripe = listings.find((l) => l.company === 'Stripe')
      expect(stripe).toBeDefined()
      expect(stripe!.title).toBe('Data Scientist')
    })

    it('[P1] should extract title and company from "Title | Company" pattern', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const netflix = listings.find((l) => l.company === 'Netflix')
      expect(netflix).toBeDefined()
      expect(netflix!.title).toBe('Frontend Developer')
    })

    it('[P1] should extract salary from description text', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const google = listings.find((l) => l.company === 'Google')
      expect(google!.salary_min).toBe(150000)
      expect(google!.salary_max).toBe(200000)
    })

    it('[P1] should extract salary with k notation', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const netflix = listings.find((l) => l.company === 'Netflix')
      expect(netflix!.salary_min).toBe(120000)
      expect(netflix!.salary_max).toBe(160000)
    })

    it('[P1] should extract location from description', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const google = listings.find((l) => l.company === 'Google')
      expect(google!.location).toBe('San Francisco, CA')
    })

    it('[P1] should infer remote from description text', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const stripe = listings.find((l) => l.company === 'Stripe')
      expect(stripe!.is_remote).toBe(true)
    })

    it('[P1] should strip HTML from description_text', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const google = listings.find((l) => l.company === 'Google')
      expect(google!.description_text).not.toContain('<p>')
      expect(google!.description_text).toContain('Build scalable systems')
    })

    it('[P1] should preserve raw RSS item in raw_data', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings[0].raw_data).toBeDefined()
      expect(listings[0].raw_data).toHaveProperty('title')
      expect(listings[0].raw_data).toHaveProperty('link')
    })

    it('[P1] should set source_name to rss', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings.every((l) => l.source_name === 'rss')).toBe(true)
    })

    it('[P1] should generate unique external IDs', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      const ids = listings.map((l) => l.external_id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.every((id) => id.startsWith('rss-'))).toBe(true)
    })

    it('[P1] should pass Zod schema validation for all listings', async () => {
      const listings = await rssAdapter.fetchListings(defaultConfig)
      for (const listing of listings) {
        const result = rawJobListingSchema.safeParse(listing)
        expect(result.success, `Failed: ${JSON.stringify(!result.success ? result.error?.issues : [])}`).toBe(true)
      }
    })

    it('[P1] should return empty array when no feed URLs configured', async () => {
      setFeedUrls([])
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings).toEqual([])
    })

    it('[P2] should handle Atom feeds', async () => {
      setFeedUrls([ATOM_URL])
      server.use(
        http.get(ATOM_URL, () => {
          return new HttpResponse(atomFeedXml, {
            headers: { 'Content-Type': 'application/xml' },
          })
        }),
      )
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings.length).toBe(1)
      expect(listings[0].title).toBe('Backend Engineer')
      expect(listings[0].company).toBe('Shopify')
    })

    it('[P2] should handle multiple feed URLs', async () => {
      setFeedUrls([FEED_URL, ATOM_URL])
      server.use(
        http.get(ATOM_URL, () => {
          return new HttpResponse(atomFeedXml, {
            headers: { 'Content-Type': 'application/xml' },
          })
        }),
      )
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings.length).toBe(4) // 3 from RSS + 1 from Atom
    })

    it('[P2] should skip failing feeds without blocking others', async () => {
      setFeedUrls([FEED_URL, 'https://feeds.example.com/broken.rss'])
      server.use(
        http.get('https://feeds.example.com/broken.rss', () => {
          return new HttpResponse(null, { status: 500 })
        }),
      )
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings.length).toBe(3) // Only RSS feed succeeds
    })

    it('[P2] should handle empty feed gracefully', async () => {
      server.use(
        http.get(FEED_URL, () => {
          return new HttpResponse(
            '<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>',
            { headers: { 'Content-Type': 'application/xml' } },
          )
        }),
      )
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings).toEqual([])
    })

    it('[P2] should skip items without a link', async () => {
      server.use(
        http.get(FEED_URL, () => {
          return new HttpResponse(
            `<?xml version="1.0"?><rss version="2.0"><channel>
              <item><title>No Link Job</title></item>
              <item><title>Has Link at Acme</title><link>https://example.com/j</link><description>A job.</description></item>
            </channel></rss>`,
            { headers: { 'Content-Type': 'application/xml' } },
          )
        }),
      )
      const listings = await rssAdapter.fetchListings(defaultConfig)
      expect(listings.length).toBe(1)
      expect(listings[0].company).toBe('Acme')
    })
  })

  describe('feed URL management', () => {
    it('[P1] should get and set feed URLs', () => {
      setFeedUrls(['https://a.com/feed', 'https://b.com/feed'])
      expect(getFeedUrls()).toEqual(['https://a.com/feed', 'https://b.com/feed'])
    })
  })
})

describe('extractCompanyFromTitle', () => {
  it('should extract from "Title at Company"', () => {
    const result = extractCompanyFromTitle('Software Engineer at Google')
    expect(result).toEqual({ jobTitle: 'Software Engineer', company: 'Google' })
  })

  it('should extract from "Title @ Company"', () => {
    const result = extractCompanyFromTitle('Product Manager @ Stripe')
    expect(result).toEqual({ jobTitle: 'Product Manager', company: 'Stripe' })
  })

  it('should extract from "Title - Company"', () => {
    const result = extractCompanyFromTitle('Data Scientist - Meta')
    expect(result).toEqual({ jobTitle: 'Data Scientist', company: 'Meta' })
  })

  it('should extract from "Title | Company"', () => {
    const result = extractCompanyFromTitle('DevOps Engineer | Amazon')
    expect(result).toEqual({ jobTitle: 'DevOps Engineer', company: 'Amazon' })
  })

  it('should extract from "Company is hiring Title" (RSSHub/LinkedIn pattern)', () => {
    const result = extractCompanyFromTitle('Apple is hiring Software Development Engineer in Test (SDET)')
    expect(result).toEqual({ jobTitle: 'Software Development Engineer in Test (SDET)', company: 'Apple' })
  })

  it('should extract from "Company is hiring Title" with multi-word company', () => {
    const result = extractCompanyFromTitle('Sony Interactive Entertainment is hiring SDET')
    expect(result).toEqual({ jobTitle: 'SDET', company: 'Sony Interactive Entertainment' })
  })

  it('should return Unknown company when no pattern matches', () => {
    const result = extractCompanyFromTitle('Senior Software Engineer')
    expect(result).toEqual({ jobTitle: 'Senior Software Engineer', company: 'Unknown' })
  })

  it('should not treat "Senior - Level" as company separator', () => {
    const result = extractCompanyFromTitle('Engineer - Senior Level')
    expect(result).toEqual({ jobTitle: 'Engineer - Senior Level', company: 'Unknown' })
  })
})
