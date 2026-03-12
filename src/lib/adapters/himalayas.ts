import { wrapAdapterError } from '@/lib/errors'

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { fetchWithTimeout, inferRemote, parseSalaryString, stripHtml, validateListings } from './utils'

const HIMALAYAS_API = 'https://himalayas.app/jobs/api'

export const himalayasAdapter: SourceAdapter = {
  name: 'himalayas',
  displayName: 'Himalayas',
  type: 'open',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    try {
      const url = new URL(HIMALAYAS_API)
      url.searchParams.set('limit', '50')

      if (config.preferences.targetTitles.length > 0) {
        url.searchParams.set('q', config.preferences.targetTitles[0])
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
        const description = typeof job.description === 'string' ? job.description : ''
        const descriptionHtml = description
        const descriptionText = stripHtml(description)

        // Prefer numeric minSalary/maxSalary, fallback to string salary parsing
        let salaryMin: number | undefined
        let salaryMax: number | undefined

        if (typeof job.minSalary === 'number') {
          salaryMin = job.minSalary
        }
        if (typeof job.maxSalary === 'number') {
          salaryMax = job.maxSalary
        }

        // Fallback: parse legacy string salary field
        if (salaryMin === undefined && salaryMax === undefined && typeof job.salary === 'string') {
          const parsed = parseSalaryString(job.salary)
          salaryMin = parsed.min
          salaryMax = parsed.max
        }

        const locationRestrictions = Array.isArray(job.locationRestrictions)
          ? job.locationRestrictions
          : []
        const location = typeof locationRestrictions[0] === 'string'
          ? locationRestrictions[0]
          : undefined

        return {
          source_name: 'himalayas',
          external_id: `himalayas-${job.guid ?? job.id ?? ''}`,
          title: typeof job.title === 'string' ? job.title : '',
          company: typeof job.companyName === 'string' ? job.companyName : '',
          source_url: typeof job.applicationLink === 'string' ? job.applicationLink : '',
          apply_url: typeof job.applicationLink === 'string' ? job.applicationLink : undefined,
          description_text: descriptionText,
          description_html: descriptionHtml || undefined,
          salary_min: salaryMin,
          salary_max: salaryMax,
          location,
          is_remote: inferRemote(location),
          raw_data: job as Record<string, unknown>,
        }
      })

      return validateListings(mapped, 'himalayas')
    } catch (error) {
      throw wrapAdapterError('himalayas', error)
    }
  },
}
