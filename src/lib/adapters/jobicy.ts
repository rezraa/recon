import { wrapAdapterError } from '@/lib/errors'

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { fetchWithTimeout, stripHtml, validateListings } from './utils'

const JOBICY_API = 'https://jobicy.com/api/v2/remote-jobs'

export const jobicyAdapter: SourceAdapter = {
  name: 'jobicy',
  displayName: 'Jobicy',
  type: 'open',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    try {
      const url = new URL(JOBICY_API)
      url.searchParams.set('count', '50')

      // Map preferences to Jobicy query params
      if (config.preferences.locations.length > 0) {
        url.searchParams.set('geo', config.preferences.locations[0])
      }
      if (config.preferences.targetTitles.length > 0) {
        url.searchParams.set('tag', config.preferences.targetTitles[0])
      }
      if ('industry' in config.preferences && typeof (config.preferences as Record<string, unknown>).industry === 'string') {
        url.searchParams.set('industry', (config.preferences as Record<string, unknown>).industry as string)
      }

      const response = await fetchWithTimeout(url.toString())
      const data: unknown = await response.json()

      if (!data || typeof data !== 'object' || !('jobs' in data)) {
        return []
      }

      const jobs = (data as { jobs?: unknown[] }).jobs
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return []
      }

      const mapped = (jobs as Record<string, unknown>[]).map((job) => {
        // Prefer jobDescription (HTML), fallback to jobExcerpt (plain text)
        const jobDescription = typeof job.jobDescription === 'string' ? job.jobDescription : ''
        const jobExcerpt = typeof job.jobExcerpt === 'string' ? job.jobExcerpt : ''

        const hasHtmlDescription = jobDescription.length > 0
        const descriptionHtml = hasHtmlDescription ? jobDescription : undefined
        const descriptionText = hasHtmlDescription ? stripHtml(jobDescription) : jobExcerpt

        const location = typeof job.jobGeo === 'string' ? job.jobGeo : undefined

        // Infer is_remote: ternary — "Anywhere" or contains "Remote" -> true
        const loc = location?.toLowerCase()
        const isRemote = loc === undefined
          ? undefined
          : (loc === 'anywhere' || loc.includes('remote'))
            ? true
            : false

        return {
          source_name: 'jobicy',
          external_id: `jobicy-${job.id ?? ''}`,
          title: typeof job.jobTitle === 'string' ? job.jobTitle : '',
          company: typeof job.companyName === 'string' ? job.companyName : '',
          source_url: typeof job.url === 'string' ? job.url : '',
          description_text: descriptionText,
          description_html: descriptionHtml,
          salary_min: typeof job.annualSalaryMin === 'number' ? job.annualSalaryMin : undefined,
          salary_max: typeof job.annualSalaryMax === 'number' ? job.annualSalaryMax : undefined,
          location,
          is_remote: isRemote,
          raw_data: job as Record<string, unknown>,
        }
      })

      return validateListings(mapped, 'jobicy')
    } catch (error) {
      throw wrapAdapterError('jobicy', error)
    }
  },
}
