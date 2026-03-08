import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'

export const themuseAdapter: SourceAdapter = {
  name: 'themuse',
  displayName: 'The Muse',
  type: 'open',

  async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
    throw new Error('themuse adapter not implemented — see Story 2-6')
  },
}
