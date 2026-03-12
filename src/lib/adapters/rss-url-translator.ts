/**
 * URL translator for constructing RSSHub LinkedIn feed URLs and search source URLs.
 */

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

export interface SearchConfig {
  rsshubUrl?: string
  serplyKey?: string
  geoId?: string
  jobTypes?: string
  expLevels?: string
}

export interface SearchUrls {
  linkedin?: string
  serply?: string // For serply, we just pass the query keywords
}

export function buildSearchUrls(query: string, config: SearchConfig): SearchUrls {
  const trimmed = query.trim()
  if (!trimmed) return {}

  const result: SearchUrls = {}

  if (config.rsshubUrl) {
    result.linkedin = buildLinkedInRssHubUrl(trimmed, config.rsshubUrl, {
      geoId: config.geoId,
      jobTypes: config.jobTypes,
      expLevels: config.expLevels,
    })
  }

  if (config.serplyKey) {
    result.serply = trimmed
  }

  return result
}
