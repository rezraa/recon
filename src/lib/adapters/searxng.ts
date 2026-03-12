/**
 * SearXNG Job Search Adapter
 *
 * Searches SearXNG for job listings across all boards (LinkedIn, Indeed,
 * Glassdoor, ZipRecruiter, company career pages, etc.), parses
 * title/company/location from search result titles, and returns
 * partial RawJobListings for insertion into the pipeline.
 *
 * Conservative by design: max 3 pages, 3s delay between requests,
 * time-limited to recent results only. Never contacts job boards directly.
 */

import { extractCompanyFromTitle } from './rss'
import type { RawJobListing } from './types'
import { fetchWithTimeout, inferRemote, validateListings } from './utils'

// ─── Configuration ──────────────────────────────────────────────────────────

const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://localhost:8080'
const DEFAULT_DELAY_MS = 3000
const DEFAULT_MAX_PAGES = 3
const DEFAULT_TIME_RANGE = 'week'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearXNGResult {
  title: string
  url: string
  content: string
  engines: string[]
}

interface SearXNGResponse {
  results: SearXNGResult[]
}

export interface SearXNGSearchOptions {
  maxPages?: number
  timeRange?: 'day' | 'week' | 'month'
  delayMs?: number
}

// ─── Rate Limiter ───────────────────────────────────────────────────────────

let lastRequestTime = 0
let delayMs = DEFAULT_DELAY_MS

async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed))
  }
  lastRequestTime = Date.now()
}

/** Reset throttle state. For test isolation only. */
export function _resetThrottle(rateLimitMs?: number): void {
  lastRequestTime = 0
  if (rateLimitMs !== undefined) {
    delayMs = rateLimitMs
  }
}

// ─── URL Classification ────────────────────────────────────────────────────

/** Known patterns for individual job pages (not listing/search pages) */
const JOB_URL_PATTERNS = [
  /linkedin\.com\/jobs\/view\//,
  /indeed\.com\/(viewjob|rc\/clk)/,
  /glassdoor\.com\/job-listing\//,
  /ziprecruiter\.com\/c\//,                 // /c/slug (individual job only, NOT /Jobs/ search pages)
  /jobs\.\w+\.com\/.+\/details\//,          // jobs.apple.com/en-us/details/...
  /\/careers?\/.*\/(job|position)/i,        // any site /careers/.../job or /career/.../position
  /\/careers?\/.*\d{4,}/,                   // /careers/title-slug-123456 (numeric job ID)
  /careers\.\w+\.com\/.*\/job\//i,          // careers.company.com/.../job/ID
  /builtin\w*\.com\/job\//,                 // builtinnyc.com/job/..., builtin.com/job/...
  /lever\.co\/.+\//,                        // jobs.lever.co/company/id
  /greenhouse\.io\/.*job/,                  // boards.greenhouse.io/.../jobs/...
  /myworkdayjobs\.com\//,                   // company.myworkdayjobs.com/...
  /wellfound\.com\/jobs\/\d/,               // wellfound.com/jobs/123-title
  /remotive\.com\/remote\/jobs\/.+\/.+/,    // remotive.com/remote/jobs/category/slug
  /snagajob\.com\/jobs\/\d/,                // snagajob.com/jobs/123456
  /monster\.com\/job-openings\//,            // monster.com/job-openings/slug
  /devitjobs\.com\/jobs\//,                  // devitjobs.com/jobs/slug
  /remotefront\.com\/remote-jobs\/.+-/,      // remotefront.com/remote-jobs/company-title-id
  /dice\.com\/job-detail\//,                 // dice.com/job-detail/uuid
  /jobgether\.com\/offer\//,                 // jobgether.com/offer/id-slug
  /\/jobs\/\d{5,}/,                         // generic /jobs/123456 (numeric ID ≥5 digits)
  /\/job\/[a-z0-9-]{8,}/i,                 // generic /job/slug-with-id (NOT /Job/ search pages)
]

/** Search/listing page patterns to reject (look like jobs but are aggregator search results) */
const SEARCH_PAGE_PATTERNS = [
  /glassdoor\.com\/Job\//,                  // /Job/ = search page, /job-listing/ = individual job
  /ziprecruiter\.com\/Jobs\//,              // /Jobs/ = search page, /c/ = individual job
  /indeed\.com\/q-/,                        // /q-keyword-jobs = search page
  /indeed\.com\/jobs\?/,                    // /jobs?q= = search page
  /jobs\.apple\.com\/.*search/,             // Apple careers search page
  /careers\.google\.com\/jobs\/results/,    // Google careers search results
  /explore\.jobs\.netflix\.net\/careers\?query/, // Netflix careers search
  /remotive\.com\/remote-jobs\/[a-z-]+$/,   // remotive category page (no slug after category)
]

/** Non-job URLs to skip (articles, guides, forums) */
const NOISE_PATTERNS = [
  /\.(edu|gov)\//,
  /reddit\.com/,
  /quora\.com/,
  /stackoverflow\.com/,
  /medium\.com/,
  /geeksforgeeks\.org/,
  /softwaretestinghelp\.com/,
  /testguild\.com/,
  /wikipedia\.org/,
  /guru99\.com/,
  /techtarget\.com/,
  /climbtheladder\.com/,
  /apidog\.com/,
  /marutitech\.com/,
  /testmuai\.com/,
  /syntaxtechs\.com/,
  /dailyremote\.com/,                        // listing/aggregator pages
  /remoterocketship\.com/,                   // aggregator listing pages
  /qatestingjobs\.com/,
  /corptocorp\.org/,
  /h30434\.www3\.hp\.com/,                   // HP support forums
  /\.qa\.com/,                               // qa.com training site (not job board)
  /platform\.qa\.com/,
  /azure\.microsoft\.com/,
  /atlassian\.com\/(devops|solutions)/,
  /ibm\.com\/think/,
  /aws\.amazon\.com\/devops/,
  /cloud\.google\.com\/devops/,
  /github\.com\/resources/,
  /builtin\.com\/articles\//,               // builtin articles, not job pages
  /edtech\.com\/jobs/,                       // aggregator listing page
  /ycombinator\.com\/jobs\/role/,            // YC role listing page, not individual jobs
  /virtualvocations\.com/,
  /thrivas\.com/,
  /usnlx\.com/,                              // aggregator
  /belmontforum\.org/,                       // academic PDFs
  /britannica\.com/,
  /merriam-webster\.com/,
  /cambridge\.org\/dictionary/,
  /collinsdictionary\.com/,
  /oxfordlearnersdictionaries\.com/,
  /computerhope\.com/,
  /newworldencyclopedia\.org/,
  /english\.stackexchange\.com/,             // language Q&A
  /randstadusa\.com/,                         // staffing aggregator
  /roberthalf\.com/,                          // staffing aggregator
  /upwork\.com/,                              // freelance platform
  /jobtoday\.com/,                            // aggregator listing
  /testdevjobs\.com/,                         // aggregator listing
  /producthunt\.com/,                         // product discovery, not jobs
  /hestiya\.com/,                             // carbon credits marketplace
  /sooperkanoon\.com/,                        // legal case search
  /casemine\.com/,                            // legal case search
  /usaswimming\.org/,                         // unrelated org
  /theiacp\.org/,                             // unrelated org
  /dynamitejobs\.com/,                        // aggregator
  /arc\.dev/,                                 // aggregator
  /deeprec\.ai/,                              // aggregator
]

export function isJobUrl(url: string): boolean {
  if (NOISE_PATTERNS.some((p) => p.test(url))) return false
  if (SEARCH_PAGE_PATTERNS.some((p) => p.test(url))) return false
  return JOB_URL_PATTERNS.some((p) => p.test(url))
}

/**
 * Generate a stable external ID from a job URL.
 * Extracts numeric IDs from known boards, falls back to URL hash.
 */
export function extractExternalId(url: string): string {
  // LinkedIn: /jobs/view/{slug}-{numericId} or /jobs/view/{numericId}
  const liMatch = url.match(/linkedin\.com\/jobs\/view\/(?:.*[-/])?(\d{5,})/)
  if (liMatch) return `searxng-li-${liMatch[1]}`

  // Apple: /details/{id}/...
  const appleMatch = url.match(/jobs\.apple\.com\/.+\/details\/(\d+)/)
  if (appleMatch) return `searxng-apple-${appleMatch[1]}`

  // Generic: hash the URL path
  const path = url.replace(/https?:\/\//, '').replace(/[?#].*/, '')
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0
  }
  return `searxng-${Math.abs(hash).toString(36)}`
}

// ─── Parsing Helpers ────────────────────────────────────────────────────────

/**
 * Detect source name from URL hostname.
 */
export function detectSource(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    if (host.includes('linkedin.com')) return 'linkedin'
    if (host.includes('indeed.com')) return 'indeed'
    if (host.includes('glassdoor.com')) return 'glassdoor'
    if (host.includes('ziprecruiter.com')) return 'ziprecruiter'
    if (host.includes('builtin')) return 'builtin'
    // Company career pages: "careers.salesforce.com" → "salesforce"
    const parts = host.split('.')
    if (parts[0] === 'jobs' || parts[0] === 'careers') return parts[1] ?? host
    return host.split('.')[0]
  } catch {
    return 'web'
  }
}

/**
 * Parse a search result title into job title, company, and location.
 *
 * Handles patterns from multiple boards:
 *   "Company hiring Title in Location | LinkedIn"
 *   "Title at Company - Location"
 *   "Title - Company | LinkedIn"
 *   "Title - Jobs - Careers at Company"
 *   "Title, Company - Location | Glassdoor"
 */
export function parseSearchTitle(rawTitle: string): {
  jobTitle: string
  company: string
  location?: string
} {
  // Strip trailing site names: " | LinkedIn", " | Glassdoor", " - Indeed", " | ZipRecruiter"
  const title = rawTitle
    .replace(/\s*[|–—-]\s*(LinkedIn|Indeed|Glassdoor|ZipRecruiter|Dice|BuiltIn\w*)\s*$/i, '')
    .trim()

  // "Company hiring Title in Location"
  const hiringInMatch = title.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+)$/i)
  if (hiringInMatch) {
    return {
      company: hiringInMatch[1].trim(),
      jobTitle: hiringInMatch[2].trim(),
      location: hiringInMatch[3].trim(),
    }
  }

  // "Company hiring Title"
  const hiringMatch = title.match(/^(.+?)\s+hiring\s+(.+)$/i)
  if (hiringMatch) {
    return {
      company: hiringMatch[1].trim(),
      jobTitle: hiringMatch[2].trim(),
    }
  }

  // "Title - Jobs - Careers at Company"
  const careersMatch = title.match(/^(.+?)\s*[-–—]\s*(?:Jobs\s*[-–—]\s*)?Careers\s+at\s+(.+)$/i)
  if (careersMatch) {
    return {
      jobTitle: careersMatch[1].trim(),
      company: careersMatch[2].trim(),
    }
  }

  // Fall back to the RSS adapter's parser ("Title at Company", "Title - Company", etc.)
  const parsed = extractCompanyFromTitle(title)
  return { jobTitle: parsed.jobTitle, company: parsed.company }
}

// ─── Location Extraction from Snippets ─────────────────────────────────────

// Common US state abbreviations for pattern matching
const US_STATE_ABBREVS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

/**
 * Extract "City, ST" from a search result snippet.
 * Matches patterns like "San Mateo, CA", "New York, NY 10001", "Jersey City, NJ"
 */
export function extractLocationFromSnippet(content: string): string | undefined {
  if (!content) return undefined
  const match = content.match(/([A-Z][a-zA-Z\s.-]{1,25}),\s*([A-Z]{2})(?:\s+\d{5})?/)
  if (match && US_STATE_ABBREVS.has(match[2])) {
    return `${match[1].trim()}, ${match[2]}`
  }
  return undefined
}

/**
 * Extract location from a LinkedIn job URL path.
 * LinkedIn URLs often encode location: /jobs/view/sdet-new-york-ny-12345/
 */
export function extractLocationFromUrl(url: string): string | undefined {
  // LinkedIn: look for state abbreviation pattern in slug
  const liMatch = url.match(/linkedin\.com\/jobs\/view\/.*?-([a-z]+-[a-z]{2})-\d+/)
  if (liMatch) {
    const parts = liMatch[1].split('-')
    const state = parts[parts.length - 1]?.toUpperCase()
    if (state && US_STATE_ABBREVS.has(state)) {
      const city = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      return `${city}, ${state}`
    }
  }
  return undefined
}

// ─── Main Search Function ───────────────────────────────────────────────────

export async function searchSearXNG(
  query: string,
  options?: SearXNGSearchOptions,
): Promise<RawJobListing[]> {
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES
  const timeRange = options?.timeRange ?? DEFAULT_TIME_RANGE
  if (options?.delayMs !== undefined) delayMs = options.delayMs

  const searchQuery = `${query} jobs hiring`
  const seenIds = new Set<string>()
  const allListings: Record<string, unknown>[] = []

  for (let page = 1; page <= maxPages; page++) {
    await throttle()

    const params = new URLSearchParams({
      q: searchQuery,
      format: 'json',
      pageno: String(page),
      time_range: timeRange,
    })

    let data: SearXNGResponse
    try {
      const res = await fetchWithTimeout(
        `${SEARXNG_URL}/search?${params}`,
        {},
        15_000,
      )
      data = (await res.json()) as SearXNGResponse
    } catch {
      break
    }

    const results = data.results ?? []
    if (results.length === 0) break

    for (const result of results) {
      if (!isJobUrl(result.url)) continue

      const externalId = extractExternalId(result.url)
      if (seenIds.has(externalId)) continue
      seenIds.add(externalId)

      const parsed = parseSearchTitle(result.title)
      const source = detectSource(result.url)

      // Extract location from title parse, snippet, or URL
      const location = parsed.location
        ?? extractLocationFromSnippet(result.content)
        ?? extractLocationFromUrl(result.url)

      allListings.push({
        source_name: source,
        external_id: externalId,
        title: parsed.jobTitle || query,
        company: parsed.company || 'Unknown',
        source_url: result.url,
        apply_url: result.url,
        description_text: result.content || parsed.jobTitle || query,
        location,
        is_remote: inferRemote(location ?? result.content),
        raw_data: result as unknown as Record<string, unknown>,
      })
    }

    if (results.length < 5) break
  }

  return validateListings(allListings, 'searxng')
}
