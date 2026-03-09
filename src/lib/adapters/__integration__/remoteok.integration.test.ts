import { describe, expect, it } from 'vitest'

import { remoteokAdapter } from '../remoteok'
import { rawJobListingSchema } from '../types'

const defaultConfig = {
  preferences: { targetTitles: [], locations: [], remotePreference: null },
}

/** @priority-3 */
describe('RemoteOK Integration', () => {
  it('should fetch real listings via adapter and validate against schema', async () => {
    const listings = await remoteokAdapter.fetchListings(defaultConfig)

    expect(Array.isArray(listings)).toBe(true)
    expect(listings.length).toBeGreaterThan(0)

    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
      expect(listing.source_name).toBe('remoteok')
      expect(listing.external_id).toMatch(/^remoteok-/)
      expect(listing.source_url).toContain('remoteok.com')
    }
  })
})
