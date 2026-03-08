import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'

export const himalayasAdapter: SourceAdapter = {
  name: 'himalayas',
  displayName: 'Himalayas',
  type: 'open',

  async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
    throw new Error('himalayas adapter not implemented — see Story 2-6')
  },
}
