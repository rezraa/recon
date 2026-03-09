import { wrapAdapterError } from '@/lib/errors'

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { fetchWithTimeout, inferRemote, stripHtml, validateListings } from './utils'

const REMOTEOK_API = 'https://remoteok.com/api'

export const remoteokAdapter: SourceAdapter = {
  name: 'remoteok',
  displayName: 'Remote OK',
  type: 'open',

  async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
    try {
      const response = await fetchWithTimeout(REMOTEOK_API, {
        headers: { 'User-Agent': 'Recon/1.0 (job-aggregator)' },
      })

      const data: unknown = await response.json()

      if (!Array.isArray(data)) {
        return []
      }

      // First element is metadata/legal object — skip it
      const jobs = data.slice(1)

      if (jobs.length === 0) {
        return []
      }

      const mapped = (jobs as Record<string, unknown>[]).map((job) => {
        const descriptionHtml = typeof job.description === 'string' ? job.description : ''
        const descriptionText = stripHtml(descriptionHtml)
        const location = typeof job.location === 'string' ? job.location : undefined

        return {
          source_name: 'remoteok',
          external_id: `remoteok-${job.id ?? ''}`,
          title: typeof job.position === 'string' ? job.position : '',
          company: typeof job.company === 'string' ? job.company : '',
          source_url: typeof job.url === 'string' ? job.url : '',
          apply_url: typeof job.apply_url === 'string' ? job.apply_url : undefined,
          description_text: descriptionText,
          description_html: descriptionHtml || undefined,
          salary_min: typeof job.salary_min === 'number' ? job.salary_min : undefined,
          salary_max: typeof job.salary_max === 'number' ? job.salary_max : undefined,
          location,
          is_remote: inferRemote(location),
          raw_data: job as Record<string, unknown>,
        }
      })

      return validateListings(mapped, 'remoteok')
    } catch (error) {
      throw wrapAdapterError('remoteok', error)
    }
  },
}
