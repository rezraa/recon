import { wrapAdapterError } from '@/lib/errors'

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { fetchWithTimeout, stripHtml, validateListings } from './utils'

const THEMUSE_API = 'https://www.themuse.com/api/public/jobs'

export const themuseAdapter: SourceAdapter = {
  name: 'themuse',
  displayName: 'The Muse',
  type: 'open',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    try {
      const url = new URL(THEMUSE_API)
      url.searchParams.set('page', '0')

      // Map preferences to TheMuse query params
      if (config.preferences.locations.length > 0) {
        url.searchParams.set('location', config.preferences.locations[0])
      }
      if (config.preferences.targetTitles.length > 0) {
        url.searchParams.set('category', config.preferences.targetTitles[0])
      }

      const response = await fetchWithTimeout(url.toString())
      const data: unknown = await response.json()

      if (!data || typeof data !== 'object' || !('results' in data)) {
        return []
      }

      const results = (data as { results?: unknown[] }).results
      if (!Array.isArray(results) || results.length === 0) {
        return []
      }

      const mapped = (results as Record<string, unknown>[]).map((job) => {
        const contents = typeof job.contents === 'string' ? job.contents : ''
        const descriptionHtml = contents
        const descriptionText = stripHtml(contents)

        const locations = Array.isArray(job.locations) ? job.locations : []
        const firstLocation = locations[0] as { name?: string } | undefined
        const locationName = typeof firstLocation?.name === 'string' ? firstLocation.name : undefined

        const company = job.company as { name?: string } | undefined

        const refs = job.refs as { landing_page?: string } | undefined
        const sourceUrl = typeof refs?.landing_page === 'string'
          ? refs.landing_page
          : `https://www.themuse.com/jobs/${job.id}`

        // is_remote: ternary — check if any location name contains "Remote" or "Flexible"
        const isRemote = locations.length > 0
          ? locations.some(
              (l: { name?: string }) =>
                typeof l.name === 'string' &&
                (l.name.toLowerCase().includes('remote') || l.name.toLowerCase().includes('flexible')),
            )
          : undefined

        return {
          source_name: 'themuse',
          external_id: `themuse-${job.id ?? ''}`,
          title: typeof job.name === 'string' ? job.name : '',
          company: typeof company?.name === 'string' ? company.name : '',
          source_url: sourceUrl,
          description_text: descriptionText,
          description_html: descriptionHtml || undefined,
          // TheMuse does NOT provide salary data
          salary_min: undefined,
          salary_max: undefined,
          location: locationName,
          is_remote: isRemote,
          raw_data: job as Record<string, unknown>,
        }
      })

      return validateListings(mapped, 'themuse')
    } catch (error) {
      throw wrapAdapterError('themuse', error)
    }
  },
}
