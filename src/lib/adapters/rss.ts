/**
 * RSS Feed Adapter
 *
 * Generic adapter that fetches job listings from user-configured RSS feed URLs.
 * Works with LinkedIn job alerts, Indeed RSS, We Work Remotely, and any
 * standard RSS/Atom feed containing job listings.
 *
 * Feed URLs are stored in the sources table (source_url column).
 */

import { createHash } from 'crypto'

import { XMLParser } from 'fast-xml-parser'

import { fetchWithTimeout, inferRemote, parseSalaryString, stripHtml, validateListings } from './utils'
import { wrapAdapterError } from '@/lib/errors'
import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'

// ─── RSS Item Shape ──────────────────────────────────────────────────────────

interface RssItem {
  title?: string
  link?: string
  description?: string
  'content:encoded'?: string
  pubDate?: string
  guid?: string | { '#text': string }
  author?: string
  'dc:creator'?: string
  category?: string | string[]
}

// ─── Feed URL Storage ────────────────────────────────────────────────────────

let _feedUrls: string[] = []

export function setFeedUrls(urls: string[]): void {
  _feedUrls = urls
}

export function getFeedUrls(): string[] {
  return _feedUrls
}

// ─── XML Parser ──────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
})

// ─── Parsing Helpers ─────────────────────────────────────────────────────────

function extractGuid(item: RssItem): string {
  if (!item.guid) return ''
  if (typeof item.guid === 'string') return item.guid
  return item.guid['#text'] ?? ''
}

/** Try to extract company from title patterns like "Job Title at Company" or "Job Title - Company" */
export function extractCompanyFromTitle(title: string): { jobTitle: string; company: string } {
  // "Company is hiring Title" (RSSHub / LinkedIn pattern)
  const hiringMatch = title.match(/^(.+?)\s+is\s+hiring\s+(.+)$/i)
  if (hiringMatch) return { jobTitle: hiringMatch[2].trim(), company: hiringMatch[1].trim() }

  // "Title at Company" or "Title @ Company"
  const atMatch = title.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i)
  if (atMatch) return { jobTitle: atMatch[1].trim(), company: atMatch[2].trim() }

  // "Title - Company" (but not "Senior - Level" type dashes)
  const dashMatch = title.match(/^(.+?)\s+-\s+(.+)$/)
  if (dashMatch) {
    const left = dashMatch[1].trim()
    const right = dashMatch[2].trim()
    // Heuristic: if right side looks like a company (starts with capital, not a skill/level)
    if (/^[A-Z]/.test(right) && !right.match(/^(Senior|Junior|Mid|Lead|Staff|Entry|Remote|Full)/i)) {
      return { jobTitle: left, company: right }
    }
  }

  // "Title | Company"
  const pipeMatch = title.match(/^(.+?)\s*\|\s*(.+)$/)
  if (pipeMatch) return { jobTitle: pipeMatch[1].trim(), company: pipeMatch[2].trim() }

  return { jobTitle: title, company: 'Unknown' }
}

/** Extract salary from description text */
function extractSalaryFromText(text: string): { min?: number; max?: number } {
  // Match patterns like "$120k-$150k", "$120,000 - $150,000", "$80K - $100K"
  const rangeMatch = text.match(/\$[\d,.]+[kK]?\s*[-–—to]+\s*\$[\d,.]+[kK]?/)
  if (rangeMatch) {
    const parsed = parseSalaryString(rangeMatch[0])
    return { min: parsed.min, max: parsed.max }
  }
  return {}
}

/** Extract location from description text */
function extractLocationFromText(text: string): string | undefined {
  // Common patterns: "Location: San Francisco, CA" or "📍 New York, NY"
  const locMatch = text.match(/(?:location|📍|based in|located in)[:\s]+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/i)
  if (locMatch) return locMatch[1].trim()
  return undefined
}

// ─── Feed Fetching ───────────────────────────────────────────────────────────

async function fetchFeed(url: string): Promise<RssItem[]> {
  const response = await fetchWithTimeout(url)
  const xml = await response.text()
  const parsed = parser.parse(xml)

  // Handle RSS 2.0
  const rssItems = parsed?.rss?.channel?.item
  if (rssItems) {
    return Array.isArray(rssItems) ? rssItems : [rssItems]
  }

  // Handle Atom feeds
  const atomEntries = parsed?.feed?.entry
  if (atomEntries) {
    const entries = Array.isArray(atomEntries) ? atomEntries : [atomEntries]
    return entries.map((e: Record<string, unknown>) => ({
      title: e.title as string,
      link: typeof e.link === 'object' && e.link !== null ? (e.link as Record<string, string>)['@_href'] : e.link as string,
      description: (e.summary ?? e.content) as string,
      pubDate: e.published as string ?? e.updated as string,
      guid: e.id as string,
      author: typeof e.author === 'object' && e.author !== null ? (e.author as Record<string, string>).name : e.author as string,
    }))
  }

  return []
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const rssAdapter: SourceAdapter = {
  name: 'rss',
  displayName: 'RSS Feeds',
  type: 'open',

  async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
    const urls = getFeedUrls()
    if (urls.length === 0) return []

    try {
      const allItems: RawJobListing[] = []

      for (const url of urls) {
        let items: RssItem[]
        try {
          items = await fetchFeed(url)
        } catch {
          // Skip individual feed failures — don't block other feeds
          continue
        }

        const mapped = items.map((item): RawJobListing | null => {
          const rawTitle = typeof item.title === 'string' ? item.title.trim() : ''
          if (!rawTitle) return null

          const { jobTitle, company } = extractCompanyFromTitle(rawTitle)

          const descriptionHtml = item['content:encoded'] ?? item.description ?? ''
          const descriptionText = stripHtml(descriptionHtml)

          const link = typeof item.link === 'string' ? item.link : ''
          if (!link) return null

          const guid = extractGuid(item) || link
          const salary = extractSalaryFromText(descriptionText)
          const location = extractLocationFromText(descriptionText)

          return {
            source_name: 'rss',
            external_id: `rss-${createHash('sha256').update(guid).digest('base64url').slice(0, 20)}`,
            title: jobTitle,
            company,
            source_url: link,
            apply_url: link,
            description_text: descriptionText || jobTitle,
            description_html: descriptionHtml || undefined,
            salary_min: salary.min,
            salary_max: salary.max,
            location,
            is_remote: inferRemote(location ?? descriptionText),
            raw_data: item as unknown as Record<string, unknown>,
          }
        })

        const valid = mapped.filter((m): m is RawJobListing => m !== null)
        allItems.push(...valid)
      }

      return validateListings(allItems, 'rss')
    } catch (error) {
      throw wrapAdapterError('rss', error)
    }
  },
}
