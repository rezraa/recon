import { describe, expect, it } from 'vitest'

import { jobicyAdapter } from '../jobicy'
import { rawJobListingSchema } from '../types'

const defaultConfig = {
  preferences: { targetTitles: [], locations: [], remotePreference: null },
}

/** @priority-3 */
describe('Jobicy Integration', () => {
  // NOTE: Jobicy has a strict rate limit of max 1 request/hour.
  // This test should be run conservatively and not in CI.

  it('should fetch real listings via adapter and validate against schema', async () => {
    const listings = await jobicyAdapter.fetchListings(defaultConfig)

    expect(Array.isArray(listings)).toBe(true)
    expect(listings.length).toBeGreaterThan(0)

    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
      expect(listing.source_name).toBe('jobicy')
      expect(listing.external_id).toMatch(/^jobicy-/)
      expect(listing.source_url).toContain('jobicy.com')
    }
  })
})
