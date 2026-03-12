import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

import {
  fetchLinkedInDetail,
  parseLargestSection,
  parseMetaDescription,
  parseShowMoreMarkup,
  stripHtml,
} from './linkedin-detail'

const FIXTURE_HTML = readFileSync(
  join(__dirname, '__fixtures__/linkedin-detail.html'),
  'utf-8',
)

// ─── parseShowMoreMarkup ────────────────────────────────────────────────────

describe('parseShowMoreMarkup', () => {
  it('[P1] should extract content from show-more-less-html__markup div', () => {
    const result = parseShowMoreMarkup(FIXTURE_HTML)

    expect(result).not.toBeNull()
    expect(result).toContain('5+ years of experience with Node.js')
    expect(result).toContain('PostgreSQL and Redis')
  })

  it('[P1] should return null when div is not present', () => {
    const html = '<div class="other">content</div>'
    expect(parseShowMoreMarkup(html)).toBeNull()
  })

  it('[P1] should handle nested divs without truncation', () => {
    const html = `<div class="show-more-less-html__markup">
      <div class="inner">Requirements section</div>
      <p>Benefits section after nested div</p>
    </div>`
    const result = parseShowMoreMarkup(html)

    expect(result).not.toBeNull()
    expect(result).toContain('Requirements section')
    expect(result).toContain('Benefits section after nested div')
  })

  it('[P1] should handle deeply nested divs', () => {
    const html = `<div class="show-more-less-html__markup">
      <div><div>Deep content</div></div>
      <p>After deep nesting</p>
    </div>`
    const result = parseShowMoreMarkup(html)

    expect(result).not.toBeNull()
    expect(result).toContain('Deep content')
    expect(result).toContain('After deep nesting')
  })
})

// ─── parseMetaDescription ───────────────────────────────────────────────────

describe('parseMetaDescription', () => {
  it('[P1] should extract meta description content', () => {
    const result = parseMetaDescription(FIXTURE_HTML)

    expect(result).not.toBeNull()
    expect(result).toContain('Senior Software Engineer')
  })

  it('[P1] should return null when meta tag is missing', () => {
    const html = '<html><head></head></html>'
    expect(parseMetaDescription(html)).toBeNull()
  })

  it('[P2] should return null for short meta descriptions (< 50 chars)', () => {
    const html = '<meta name="description" content="Short desc" />'
    expect(parseMetaDescription(html)).toBeNull()
  })
})

// ─── parseLargestSection ────────────────────────────────────────────────────

describe('parseLargestSection', () => {
  it('[P1] should find the largest section block', () => {
    const result = parseLargestSection(FIXTURE_HTML)

    expect(result).not.toBeNull()
    expect(result).toContain('show-more-less-html__markup')
  })

  it('[P1] should return null when no sections exist', () => {
    const html = '<div>no sections here</div>'
    expect(parseLargestSection(html)).toBeNull()
  })

  it('[P2] should skip small sections (< 100 chars)', () => {
    const html = '<section>tiny</section>'
    expect(parseLargestSection(html)).toBeNull()
  })
})

// ─── stripHtml ──────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('[P1] should remove HTML tags and decode entities', () => {
    const result = stripHtml('<p>Hello &amp; <strong>world</strong></p>')
    expect(result).toBe('Hello & world')
  })

  it('[P1] should convert <br> to newlines', () => {
    const result = stripHtml('line1<br/>line2<br>line3')
    expect(result).toContain('line1\nline2\nline3')
  })

  it('[P2] should collapse multiple newlines', () => {
    const result = stripHtml('<p>a</p><p></p><p></p><p>b</p>')
    expect(result).not.toContain('\n\n\n')
  })

  it('[P1] should decode numeric HTML entities', () => {
    const result = stripHtml('Copyright &#169; 2026 &#8212; All rights reserved')
    expect(result).toContain('©')
    expect(result).toContain('—')
  })

  it('[P1] should decode hex HTML entities', () => {
    const result = stripHtml('Price: &#x24;100k &#x2013; &#x24;150k')
    expect(result).toContain('$100k')
    expect(result).toContain('$150k')
  })
})

// ─── fetchLinkedInDetail ────────────────────────────────────────────────────

describe('fetchLinkedInDetail', () => {
  it('[P1] should parse LinkedIn HTML and return description', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(FIXTURE_HTML, { status: 200 }),
    )

    const result = await fetchLinkedInDetail('https://linkedin.com/jobs/view/123')

    expect(result).not.toBeNull()
    expect(result!.descriptionText).toContain('5+ years of experience')
    expect(result!.descriptionHtml).toContain('<li>')
  })

  it('[P1] should return null on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not found', { status: 404 }),
    )

    const result = await fetchLinkedInDetail('https://linkedin.com/jobs/view/999')
    expect(result).toBeNull()
  })

  it('[P1] should fall back to meta description when show-more div missing', async () => {
    const htmlNoShowMore = `
      <html>
        <head><meta name="description" content="We are hiring a great developer with strong experience in distributed systems and cloud architecture." /></head>
        <body><div>no show-more div</div></body>
      </html>`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(htmlNoShowMore, { status: 200 }),
    )

    const result = await fetchLinkedInDetail('https://linkedin.com/jobs/view/456')

    expect(result).not.toBeNull()
    expect(result!.descriptionText).toContain('distributed systems')
  })

  it('[P1] should return null when all parsers fail', async () => {
    const emptyHtml = '<html><head></head><body>nothing useful</body></html>'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(emptyHtml, { status: 200 }),
    )

    const result = await fetchLinkedInDetail('https://linkedin.com/jobs/view/789')
    expect(result).toBeNull()
  })
})
