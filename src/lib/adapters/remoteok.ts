import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'

export const remoteokAdapter: SourceAdapter = {
  name: 'remoteok',
  displayName: 'Remote OK',
  type: 'open',

  async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
    throw new Error('remoteok adapter not implemented — see Story 2-6')
  },
}
