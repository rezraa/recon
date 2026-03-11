import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/sources', () => ({
  findAllSources: vi.fn(),
}))

import { findAllSources } from '@/lib/db/queries/sources'

import { GET } from './route'

const mockFindAllSources = vi.mocked(findAllSources)

describe('GET /api/sources', () => {
  it('should return all sources with configuration status', async () => {
    mockFindAllSources.mockResolvedValue([
      {
        id: '1',
        name: 'serply',
        displayName: 'Serply',
        type: 'key_required',
        isEnabled: true,
        lastFetchAt: null,
        lastError: null,
        listingsCount: 0,
        healthStatus: null,
        config: { apiKey: 'encrypted-value' },
        errorCount: 0,
        consecutiveErrors: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(4)

    // Open sources should be configured and active
    const himalayas = json.data.find((s: { name: string }) => s.name === 'himalayas')
    expect(himalayas.isConfigured).toBe(true)
    expect(himalayas.isActive).toBe(true)

    // Serply with config should be configured
    const serply = json.data.find((s: { name: string }) => s.name === 'serply')
    expect(serply.isConfigured).toBe(true)
    expect(serply.signupUrl).toBe('https://serply.io')
  })

  it('should not expose config, apiKey, or raw_data fields', async () => {
    mockFindAllSources.mockResolvedValue([
      {
        id: '1',
        name: 'serply',
        displayName: 'Serply',
        type: 'key_required',
        isEnabled: true,
        lastFetchAt: null,
        lastError: null,
        listingsCount: 0,
        healthStatus: null,
        config: { apiKey: 'should-not-appear' },
        errorCount: 0,
        consecutiveErrors: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)

    const res = await GET()
    const json = await res.json()

    for (const source of json.data) {
      expect(source).not.toHaveProperty('config')
      expect(source).not.toHaveProperty('apiKey')
      expect(source).not.toHaveProperty('raw_data')
    }
  })

  it('should show serply as not configured when no config in DB', async () => {
    mockFindAllSources.mockResolvedValue([])

    const res = await GET()
    const json = await res.json()

    const serply = json.data.find((s: { name: string }) => s.name === 'serply')
    expect(serply.isConfigured).toBe(false)
    expect(serply.isActive).toBe(false)
  })

  it('should return 500 on database error', async () => {
    mockFindAllSources.mockRejectedValue(new Error('DB down'))

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error.code).toBe(500)
  })
})
