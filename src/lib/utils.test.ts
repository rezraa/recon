import { describe, expect, it } from 'vitest'

import { sanitizeHtml } from './utils'

describe('sanitizeHtml', () => {
  describe('script tag removal', () => {
    it('[P1] should strip basic script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
      expect(sanitizeHtml(input)).not.toContain('<script')
      expect(sanitizeHtml(input)).not.toContain('</script>')
      expect(sanitizeHtml(input)).toContain('<p>Hello</p>')
      expect(sanitizeHtml(input)).toContain('<p>World</p>')
    })

    it('[P1] should strip script tags with attributes', () => {
      const input = '<script type="text/javascript" src="evil.js"></script>'
      expect(sanitizeHtml(input)).not.toContain('<script')
    })

    it('[P1] should strip script tags case-insensitively', () => {
      const input = '<SCRIPT>alert(1)</SCRIPT>'
      expect(sanitizeHtml(input)).not.toContain('SCRIPT')
      expect(sanitizeHtml(input)).not.toContain('alert')
    })

    it('[P1] should strip multiline script tags', () => {
      const input = '<script>\n  var x = 1;\n  alert(x);\n</script>'
      expect(sanitizeHtml(input)).not.toContain('<script')
      expect(sanitizeHtml(input)).not.toContain('alert')
    })

    it('[P2] should handle nested script-like content', () => {
      const input = '<script>document.write("<script>alert(1)</script>")</script>'
      const result = sanitizeHtml(input)
      expect(result).not.toContain('<script')
    })
  })

  describe('event handler removal', () => {
    it('[P1] should strip onclick handlers with double quotes', () => {
      const input = '<div onclick="alert(1)">Click</div>'
      expect(sanitizeHtml(input)).not.toContain('onclick')
      expect(sanitizeHtml(input)).not.toContain('alert')
    })

    it('[P1] should strip onclick handlers with single quotes', () => {
      const input = "<div onclick='alert(1)'>Click</div>"
      expect(sanitizeHtml(input)).not.toContain('onclick')
    })

    it('[P1] should strip onerror handlers', () => {
      const input = '<img onerror="alert(1)" src="x">'
      expect(sanitizeHtml(input)).not.toContain('onerror')
    })

    it('[P1] should strip onload handlers', () => {
      const input = '<body onload="alert(1)">'
      expect(sanitizeHtml(input)).not.toContain('onload')
    })

    it('[P1] should strip onmouseover handlers', () => {
      const input = '<div onmouseover="alert(1)">Hover</div>'
      expect(sanitizeHtml(input)).not.toContain('onmouseover')
    })

    it('[P2] should strip onfocus handlers', () => {
      const input = '<input onfocus="alert(1)">'
      expect(sanitizeHtml(input)).not.toContain('onfocus')
    })

    it('[P2] should strip event handlers without quotes', () => {
      const input = '<div onclick=alert(1)>Click</div>'
      expect(sanitizeHtml(input)).not.toContain('onclick')
    })
  })

  describe('javascript: URI removal', () => {
    it('[P1] should strip javascript: URIs', () => {
      const input = '<a href="javascript:alert(1)">Click</a>'
      expect(sanitizeHtml(input)).not.toContain('javascript:')
    })

    it('[P1] should strip JavaScript: URIs case-insensitively', () => {
      const input = '<a href="JavaScript:alert(1)">Click</a>'
      expect(sanitizeHtml(input)).not.toContain('javascript:')
      expect(sanitizeHtml(input)).not.toContain('JavaScript:')
    })

    it('[P2] should strip JAVASCRIPT: URIs (all caps)', () => {
      const input = '<a href="JAVASCRIPT:void(0)">Link</a>'
      expect(sanitizeHtml(input)).not.toContain('JAVASCRIPT:')
    })
  })

  describe('safe content preservation', () => {
    it('[P1] should preserve regular HTML tags', () => {
      const input = '<p>Hello <b>world</b></p>'
      expect(sanitizeHtml(input)).toBe('<p>Hello <b>world</b></p>')
    })

    it('[P1] should preserve anchor tags with safe hrefs', () => {
      const input = '<a href="https://example.com">Link</a>'
      expect(sanitizeHtml(input)).toBe('<a href="https://example.com">Link</a>')
    })

    it('[P1] should return empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('')
    })

    it('[P2] should preserve HTML entities', () => {
      const input = '<p>&amp; &lt; &gt; &quot;</p>'
      expect(sanitizeHtml(input)).toBe('<p>&amp; &lt; &gt; &quot;</p>')
    })
  })
})
