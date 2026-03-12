/**
 * LinkedIn Detail Fetcher
 *
 * Fetches the full job description from a public LinkedIn job page.
 * Used for enrichment of partial (title-only) jobs from RSSHub search results.
 *
 * Parsing strategy (priority order):
 * 1. `show-more-less-html__markup` div (standard LinkedIn job detail)
 * 2. `<meta name="description">` tag (SEO fallback)
 * 3. Largest `<section>` block (last resort)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LinkedInDetailResult {
  descriptionText: string
  descriptionHtml: string
}

// ─── HTML Parsers ───────────────────────────────────────────────────────────

/**
 * Extract text from the `show-more-less-html__markup` div.
 * This is the standard container for job descriptions on LinkedIn public pages.
 * Handles nested divs by tracking open/close depth.
 */
export function parseShowMoreMarkup(html: string): string | null {
  const openMatch = html.match(/class="show-more-less-html__markup[^"]*"[^>]*>/i)
  if (!openMatch) return null

  const startIdx = openMatch.index! + openMatch[0].length
  let depth = 1
  let i = startIdx

  while (i < html.length && depth > 0) {
    const openDiv = html.indexOf('<div', i)
    const closeDiv = html.indexOf('</div>', i)

    if (closeDiv === -1) break

    if (openDiv !== -1 && openDiv < closeDiv) {
      depth++
      i = openDiv + 4
    } else {
      depth--
      if (depth === 0) {
        return html.slice(startIdx, closeDiv).trim()
      }
      i = closeDiv + 6
    }
  }

  return null
}

/**
 * Extract content from the `<meta name="description">` tag.
 */
export function parseMetaDescription(html: string): string | null {
  const match = html.match(
    /<meta\s+name="description"\s+content="([^"]*?)"\s*\/?>/i,
  )
  if (!match) return null
  const content = match[1].trim()
  return content.length > 50 ? content : null
}

/**
 * Find the largest `<section>` block as a last resort.
 */
export function parseLargestSection(html: string): string | null {
  const sectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/gi
  let largest: string | null = null
  let maxLen = 0

  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(html)) !== null) {
    const content = match[1].trim()
    if (content.length > maxLen) {
      maxLen = content.length
      largest = content
    }
  }

  return largest && maxLen > 100 ? largest : null
}

/**
 * Strip HTML tags to produce plain text.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Main Fetcher ───────────────────────────────────────────────────────────

/**
 * Fetch the full description from a public LinkedIn job page.
 * Tries three parsing strategies in priority order.
 *
 * @param jobUrl - Full LinkedIn job URL (e.g., https://linkedin.com/jobs/view/1234)
 * @returns Parsed description or null if all parsers fail
 */
export async function fetchLinkedInDetail(
  jobUrl: string,
): Promise<LinkedInDetailResult | null> {
  const res = await fetch(jobUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; ReconBot/1.0; +https://github.com/recon)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) return null

  const html = await res.text()

  // Strategy 1: show-more-less-html__markup div
  const showMore = parseShowMoreMarkup(html)
  if (showMore) {
    return { descriptionHtml: showMore, descriptionText: stripHtml(showMore) }
  }

  // Strategy 2: meta description
  const metaDesc = parseMetaDescription(html)
  if (metaDesc) {
    return { descriptionHtml: metaDesc, descriptionText: stripHtml(metaDesc) }
  }

  // Strategy 3: largest section
  const section = parseLargestSection(html)
  if (section) {
    return { descriptionHtml: section, descriptionText: stripHtml(section) }
  }

  return null
}
