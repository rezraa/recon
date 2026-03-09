import { describe, expect, it } from 'vitest'

import { serplyAdapter } from '../serply'
import { rawJobListingSchema } from '../types'

/** @priority-3 */
describe('Serply Integration', () => {
  it.skipIf(!process.env.SERPLY_API_KEY)('should fetch real listings via adapter and validate against schema', async () => {
    const config = {
      apiKey: process.env.SERPLY_API_KEY!,
      preferences: { targetTitles: ['software engineer'], locations: ['Remote'], remotePreference: null },
    }

    const listings = await serplyAdapter.fetchListings(config)

    expect(Array.isArray(listings)).toBe(true)

    for (const listing of listings) {
      const result = rawJobListingSchema.safeParse(listing)
      expect(result.success, `Zod validation failed: ${JSON.stringify(result)}`).toBe(true)
      expect(listing.source_name).toBe('serply')
      expect(listing.external_id).toMatch(/^serply-/)
    }

    // Validate rate limit status after fetch
    const rateLimitStatus = serplyAdapter.getRateLimitStatus!()
    if (rateLimitStatus) {
      expect(rateLimitStatus.remaining).toBeGreaterThanOrEqual(0)
      expect(rateLimitStatus.resetsAt).toBeInstanceOf(Date)
    }
  })

  it('should reject invalid API key', async () => {
    const config = {
      apiKey: 'invalid-key-12345',
      preferences: { targetTitles: ['test'], locations: [], remotePreference: null },
    }

    await expect(serplyAdapter.fetchListings(config)).rejects.toThrow()
  })
})
