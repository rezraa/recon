import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/sources', () => ({
  findAllSources: vi.fn(),
}))

import { GET } from '@/app/api/sources/route'
import { findAllSources } from '@/lib/db/queries/sources'

const mockFindAllSources = vi.mocked(findAllSources)

describe('GET /api/sources — edge cases', () => {
  it('[P2] should return all 4 sources when DB has no source records at all', async () => {
    // Given: DB is completely empty
    mockFindAllSources.mockResolvedValue([])

    const res = await GET()
    const json = await res.json()

    // Then: all 4 sources still returned from registry
    expect(json.data).toHaveLength(4)

    // Open sources should still be configured and active
    const himalayas = json.data.find((s: { name: string }) => s.name === 'himalayas')
    expect(himalayas.isConfigured).toBe(true)
    expect(himalayas.isActive).toBe(true)
    expect(himalayas.type).toBe('open')
  })

  it('[P2] should include signupUrl for key_required sources and not for open sources', async () => {
    mockFindAllSources.mockResolvedValue([])

    const res = await GET()
    const json = await res.json()

    // Key-required sources should have signupUrl
    const serply = json.data.find((s: { name: string }) => s.name === 'serply')
    expect(serply.signupUrl).toBe('https://serply.io')

    // Open sources should not have signupUrl
    const openSources = json.data.filter((s: { type: string }) => s.type === 'open')
    for (const source of openSources) {
      expect(source.signupUrl).toBeUndefined()
    }
  })

  it('[P2] should return correct description for each source', async () => {
    mockFindAllSources.mockResolvedValue([])

    const res = await GET()
    const json = await res.json()

    const descriptions: Record<string, string> = {
      himalayas: 'Remote jobs across industries',
      themuse: 'Curated US job listings',
      jobicy: 'Remote jobs worldwide',
      serply: 'Google for Jobs search',
    }

    for (const [name, desc] of Object.entries(descriptions)) {
      const source = json.data.find((s: { name: string }) => s.name === name)
      expect(source.description).toBe(desc)
    }
  })

  it('[P2] should handle serply with config but no apiKey field', async () => {
    // Given: serply exists in DB but config has no apiKey
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
        config: { someOtherField: 'value' }, // No apiKey
        errorCount: 0,
        consecutiveErrors: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)

    const res = await GET()
    const json = await res.json()

    // Serply should NOT be configured without apiKey
    const serply = json.data.find((s: { name: string }) => s.name === 'serply')
    expect(serply.isConfigured).toBe(false)
  })

  it('[P2] should handle disabled source in DB', async () => {
    // Given: serply exists in DB but is disabled
    mockFindAllSources.mockResolvedValue([
      {
        id: '1',
        name: 'serply',
        displayName: 'Serply',
        type: 'key_required',
        isEnabled: false,
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

    const serply = json.data.find((s: { name: string }) => s.name === 'serply')
    expect(serply.isConfigured).toBe(true)
    expect(serply.isActive).toBe(false) // Disabled in DB
  })
})
