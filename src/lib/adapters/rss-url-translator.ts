/**
 * URL translator for constructing RSSHub feed URLs from multiple sources
 * and aggregating search source URLs.
 */

export interface RssHubRoute {
  name: string
  buildUrl: (query: string, rsshubBase: string, options?: SearchConfig) => string
}

export interface LinkedInOptions {
  geoId?: string
  jobTypes?: string // F (fulltime), P (parttime), C (contract), all
  expLevels?: string // 1-5 or all
}

export function buildLinkedInRssHubUrl(
  query: string,
  rsshubBase: string,
  options?: LinkedInOptions,
): string {
  const keywords = encodeURIComponent(query.trim())
  const base = rsshubBase.replace(/\/+$/, '')
  const jobTypes = options?.jobTypes ?? 'all'
  const expLevels = options?.expLevels ?? 'all'

  let url = `${base}/linkedin/jobs/${jobTypes}/${expLevels}/${keywords}`

  if (options?.geoId) {
    url += `?geoId=${encodeURIComponent(options.geoId)}`
  }

  return url
}

// ─── Route Registry ──────────────────────────────────────────────────────────

const linkedInRoute: RssHubRoute = {
  name: 'linkedin',
  buildUrl: (query, rsshubBase, config) =>
    buildLinkedInRssHubUrl(query, rsshubBase, {
      geoId: config?.geoId,
      jobTypes: config?.jobTypes,
      expLevels: config?.expLevels,
    }),
}

// Indeed route — disabled pending RSSHub route verification.
// RSSHub may support /indeed/{query}, or use direct Indeed RSS:
// https://www.indeed.com/rss?q={query}&l={location}
// Uncomment and register when verified:
// const indeedRoute: RssHubRoute = {
//   name: 'indeed',
//   buildUrl: (query, rsshubBase) => {
//     const base = rsshubBase.replace(/\/+$/, '')
//     return `${base}/indeed/${encodeURIComponent(query)}`
//   },
// }

const rsshubRoutes: RssHubRoute[] = [linkedInRoute]

export function registerRssHubRoute(route: RssHubRoute): void {
  rsshubRoutes.push(route)
}

export function getRssHubRoutes(): readonly RssHubRoute[] {
  return rsshubRoutes
}

/** Reset route registry to defaults. For test isolation only. */
export function _resetRssHubRoutes(): void {
  rsshubRoutes.length = 0
  rsshubRoutes.push(linkedInRoute)
}

// ─── Search URL Builder ──────────────────────────────────────────────────────

export interface SearchConfig {
  rsshubUrl?: string
  serplyKey?: string
  geoId?: string
  jobTypes?: string
  expLevels?: string
}

export interface SearchUrls {
  /** @deprecated Use rsshubFeeds instead */
  linkedin?: string
  rsshubFeeds: string[]
  serply?: string
}

export function buildSearchUrls(query: string, config: SearchConfig): SearchUrls {
  const trimmed = query.trim()
  if (!trimmed) return { rsshubFeeds: [] }

  const result: SearchUrls = { rsshubFeeds: [] }

  if (config.rsshubUrl) {
    for (const route of rsshubRoutes) {
      try {
        const url = route.buildUrl(trimmed, config.rsshubUrl, config)
        result.rsshubFeeds.push(url)
      } catch {
        // Skip routes that fail to build URLs
      }
    }
    // Backwards compat: set linkedin to the first feed (if it's the LinkedIn route)
    if (result.rsshubFeeds.length > 0) {
      result.linkedin = result.rsshubFeeds[0]
    }
  }

  if (config.serplyKey) {
    result.serply = trimmed
  }

  return result
}
