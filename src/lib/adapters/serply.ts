import { SourceError, wrapAdapterError } from '@/lib/errors'

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { fetchWithTimeout, inferRemote, parseSalaryString, stripHtml, validateListings } from './utils'

const SERPLY_API = 'https://api.serply.io/v1/job/search'

// Module-level rate limit state (worker-process-scoped)
let lastRateLimitStatus: { remaining: number; resetsAt: Date } | null = null

export const serplyAdapter: SourceAdapter = {
  name: 'serply',
  displayName: 'Serply',
  type: 'key_required',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    if (!config.apiKey) {
      throw new SourceError({
        sourceName: 'serply',
        errorType: 'auth_error',
        message: '[serply] API key is required',
      })
    }

    try {
      // Build query from first target title + first location
      const parts: string[] = []
      if (config.preferences.targetTitles.length > 0) {
        parts.push(config.preferences.targetTitles[0])
      }
      if (config.preferences.locations.length > 0) {
        parts.push(config.preferences.locations[0])
      }
      const query = parts.join(' ')
      const url = `${SERPLY_API}/q=${encodeURIComponent(query)}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30_000)

      let response: Response
      try {
        response = await fetch(url, {
          headers: { 'X-Api-Key': config.apiKey },
          signal: controller.signal,
        })
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new SourceError({
            sourceName: 'serply',
            errorType: 'timeout',
            message: `[serply] Request timed out after 30000ms`,
          })
        }
        throw fetchError
      } finally {
        clearTimeout(timeoutId)
      }

      // Parse rate limit headers (even on error responses)
      const remaining = response.headers.get('X-RateLimit-Remaining')
      const resetAt = response.headers.get('X-RateLimit-Reset')
      if (remaining !== null) {
        lastRateLimitStatus = {
          remaining: parseInt(remaining, 10),
          resetsAt: resetAt ? new Date(resetAt) : new Date(),
        }
      }

      if (!response.ok) {
        const statusError = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { status: number }
        statusError.status = response.status
        throw statusError
      }

      const data: unknown = await response.json()

      if (!data || typeof data !== 'object' || !('jobs' in data)) {
        return []
      }

      const jobs = (data as { jobs?: unknown[] }).jobs
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return []
      }

      const mapped = (jobs as Record<string, unknown>[]).map((job) => {
        const description = typeof job.description === 'string' ? job.description : ''
        const snippet = typeof job.snippet === 'string' ? job.snippet : ''
        const descriptionHtml = description || snippet || undefined
        const descriptionText = description ? stripHtml(description) : stripHtml(snippet)

        const location = typeof job.location === 'string' ? job.location : undefined

        // Parse salary from detected_extensions
        let salaryMin: number | undefined
        let salaryMax: number | undefined
        const extensions = job.detected_extensions as Record<string, unknown> | undefined
        if (extensions) {
          if (typeof extensions.salary_min === 'number') {
            salaryMin = extensions.salary_min
          }
          if (typeof extensions.salary_max === 'number') {
            salaryMax = extensions.salary_max
          }
          // Fallback: parse string salary
          if (salaryMin === undefined && salaryMax === undefined && typeof extensions.salary === 'string') {
            const parsed = parseSalaryString(extensions.salary)
            salaryMin = parsed.min
            salaryMax = parsed.max
          }
        }

        // Company name extraction
        const companyName = typeof job.company_name === 'string' ? job.company_name : ''

        return {
          source_name: 'serply',
          external_id: `serply-${job.job_id ?? ''}`,
          title: typeof job.title === 'string' ? job.title : '',
          company: companyName,
          source_url: typeof job.link === 'string' ? job.link : '',
          apply_url: typeof job.apply_link === 'string' ? job.apply_link : undefined,
          description_text: descriptionText,
          description_html: descriptionHtml,
          salary_min: salaryMin,
          salary_max: salaryMax,
          location,
          is_remote: inferRemote(location),
          raw_data: job as Record<string, unknown>,
        }
      })

      return validateListings(mapped, 'serply')
    } catch (error) {
      throw wrapAdapterError('serply', error)
    }
  },

  async validateKey(key: string): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(
        `${SERPLY_API}/q=test`,
        { headers: { 'X-Api-Key': key } },
      )
      return response.ok
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        const status = (error as { status: number }).status
        if (status === 401 || status === 403) return false
      }
      throw error
    }
  },

  getRateLimitStatus(): { remaining: number; resetsAt: Date } | null {
    return lastRateLimitStatus
  },
}
