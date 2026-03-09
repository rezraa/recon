import { describe, expect, it } from 'vitest'

import type { RawJobListing } from '@/lib/adapters/types'

import { normalize } from './normalizer'

function createRawListing(overrides?: Partial<RawJobListing>): RawJobListing {
  return {
    source_name: 'remoteok',
    external_id: `test-${Math.random().toString(36).slice(2)}`,
    title: 'Software Engineer',
    company: 'Acme Corp',
    source_url: 'https://example.com/job/123',
    description_text: 'A great job.',
    description_html: '<p>A great job.</p>',
    salary_min: 100000,
    salary_max: 150000,
    location: 'New York, NY',
    is_remote: false,
    raw_data: { test: true },
    ...overrides,
  }
}

describe('normalizer sanitization edge cases', () => {
  describe('script tag variants', () => {
    it('[P1] should strip script tags from description_text', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: 'Before <script>alert("xss")</script> After',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('<script')
      expect(normalized[0].descriptionText).toContain('Before')
      expect(normalized[0].descriptionText).toContain('After')
    })

    it('[P1] should strip script tags with src attribute', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: 'Text <script src="https://evil.com/xss.js"></script> more',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('<script')
      expect(normalized[0].descriptionText).not.toContain('evil.com')
    })

    it('[P1] should strip case-insensitive SCRIPT tags', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<SCRIPT>document.cookie</SCRIPT>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('SCRIPT')
      expect(normalized[0].descriptionText).not.toContain('document.cookie')
    })
  })

  describe('event handler variants', () => {
    it('[P1] should strip onerror on img tags', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<img src="x" onerror="alert(1)"> job desc',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('onerror')
    })

    it('[P1] should strip onload handler', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<body onload="malicious()"> content',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('onload')
    })

    it('[P2] should strip onmouseover handler', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<div onmouseover="steal()">hover me</div>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('onmouseover')
    })

    it('[P2] should strip onfocus handler', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<input onfocus="evil()" type="text">',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('onfocus')
    })
  })

  describe('javascript: URI removal', () => {
    it('[P1] should strip javascript: URIs from description_text', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<a href="javascript:alert(1)">Apply</a>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('javascript:')
    })

    it('[P2] should strip mixed-case JavaScript: URIs', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<a href="JavaScript:void(0)">Link</a>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('JavaScript:')
      expect(normalized[0].descriptionText).not.toContain('javascript:')
    })
  })

  describe('HTML tag stripping in description_text', () => {
    it('[P1] should strip all HTML tags from description_text', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<p>Build <b>amazing</b> <em>software</em></p>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('<p>')
      expect(normalized[0].descriptionText).not.toContain('<b>')
      expect(normalized[0].descriptionText).not.toContain('<em>')
      expect(normalized[0].descriptionText).toContain('Build')
      expect(normalized[0].descriptionText).toContain('amazing')
      expect(normalized[0].descriptionText).toContain('software')
    })

    it('[P1] should collapse whitespace after tag stripping', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: '<p>Word1</p>   <p>Word2</p>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toMatch(/\s{2,}/)
    })
  })

  describe('description_html passthrough', () => {
    it('[P1] should NOT sanitize description_html (no-modify policy)', () => {
      const html = '<p>Build <script>alert(1)</script> things</p>'
      const { normalized } = normalize([
        createRawListing({ description_html: html }),
      ])
      // description_html should be passed through unchanged (no-modify policy)
      expect(normalized[0].descriptionHtml).toBe(html)
    })

    it('[P1] should preserve description_html with event handlers (no-modify policy)', () => {
      const html = '<div onclick="apply()">Apply Now</div>'
      const { normalized } = normalize([
        createRawListing({ description_html: html }),
      ])
      expect(normalized[0].descriptionHtml).toBe(html)
    })
  })

  describe('combined XSS vectors', () => {
    it('[P1] should handle multiple XSS vectors in same text', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text:
            '<script>alert(1)</script> <img onerror="hack()" src=x> <a href="javascript:void(0)">click</a>',
        }),
      ])
      expect(normalized[0].descriptionText).not.toContain('<script')
      expect(normalized[0].descriptionText).not.toContain('onerror')
      expect(normalized[0].descriptionText).not.toContain('javascript:')
    })

    it('[P2] should produce clean text after stripping all dangerous content', () => {
      const { normalized } = normalize([
        createRawListing({
          description_text: 'We are hiring! <script>steal()</script> Apply today.',
        }),
      ])
      expect(normalized[0].descriptionText).toMatch(/We are hiring!.*Apply today\./)
    })
  })
})
