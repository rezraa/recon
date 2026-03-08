import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'

export const jobicyAdapter: SourceAdapter = {
  name: 'jobicy',
  displayName: 'Jobicy',
  type: 'open',

  async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
    throw new Error('jobicy adapter not implemented — see Story 2-6')
  },
}
