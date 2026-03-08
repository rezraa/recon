import { describe, expect, it } from 'vitest'

import { rawJobListingSchema } from '@/lib/adapters/types'

import { createMockAdapter, createRawJobListing } from './adapter.factory'

describe('createMockAdapter', () => {
  it('should create a mock adapter with default values', () => {
    const adapter = createMockAdapter()
    expect(adapter.name).toBeDefined()
    expect(adapter.displayName).toBeDefined()
    expect(adapter.type).toBe('open')
    expect(typeof adapter.fetchListings).toBe('function')
  })

  it('should return configured listings on fetch', async () => {
    const listing = createRawJobListing({ title: 'Test Job' })
    const adapter = createMockAdapter({ listings: [listing] })
    const result = await adapter.fetchListings({ preferences: { targetTitles: [], locations: [], remotePreference: null } })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test Job')
  })

  it('should throw configured error on fetch', async () => {
    const adapter = createMockAdapter({ shouldThrow: new Error('API down') })
    await expect(adapter.fetchListings({ preferences: { targetTitles: [], locations: [], remotePreference: null } }))
      .rejects.toThrow('API down')
  })

  it('should include validateKey when configured', async () => {
    const adapter = createMockAdapter({ validateKeyResult: true })
    expect(adapter.validateKey).toBeDefined()
    expect(await adapter.validateKey!('test-key')).toBe(true)
  })

  it('should not include validateKey by default', () => {
    const adapter = createMockAdapter()
    expect(adapter.validateKey).toBeUndefined()
  })

  it('should include getRateLimitStatus when configured', () => {
    const resetsAt = new Date('2024-03-09T00:00:00Z')
    const adapter = createMockAdapter({ rateLimitStatus: { remaining: 5, resetsAt } })
    expect(adapter.getRateLimitStatus).toBeDefined()
    const status = adapter.getRateLimitStatus!()
    expect(status).toEqual({ remaining: 5, resetsAt })
  })

  it('should return null getRateLimitStatus when configured as null', () => {
    const adapter = createMockAdapter({ rateLimitStatus: null })
    expect(adapter.getRateLimitStatus!()).toBeNull()
  })

  it('should use custom name and type', () => {
    const adapter = createMockAdapter({ name: 'custom', type: 'key_required' })
    expect(adapter.name).toBe('custom')
    expect(adapter.type).toBe('key_required')
  })
})

describe('createRawJobListing', () => {
  it('should create a valid RawJobListing', () => {
    const listing = createRawJobListing()
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(true)
  })

  it('should allow overrides', () => {
    const listing = createRawJobListing({ title: 'Custom Title', company: 'Custom Co' })
    expect(listing.title).toBe('Custom Title')
    expect(listing.company).toBe('Custom Co')
  })

  it('should generate unique external_ids', () => {
    const a = createRawJobListing()
    const b = createRawJobListing()
    expect(a.external_id).not.toBe(b.external_id)
  })
})
