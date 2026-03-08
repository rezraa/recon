import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'

export const serplyAdapter: SourceAdapter = {
  name: 'serply',
  displayName: 'Serply',
  type: 'key_required',

  async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
    throw new Error('serply adapter not implemented — see Story 2-6')
  },

  async validateKey(_key: string): Promise<boolean> {
    throw new Error('serply validateKey not implemented — see Story 2-6')
  },
}
