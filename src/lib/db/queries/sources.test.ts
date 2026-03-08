import { describe, expect, it, vi } from 'vitest'

// Mock at the module level to avoid Drizzle chain complexity
vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(),
}))

vi.mock('@/lib/config', () => ({
  getConfig: vi.fn(() => ({
    DATABASE_URL: 'postgresql://test',
    REDIS_URL: 'redis://test',
    ENCRYPTION_KEY: 'a'.repeat(64),
  })),
}))

vi.mock('@/lib/encryption', () => ({
  decrypt: vi.fn((stored: string) => `decrypted:${stored}`),
}))

import { getDb } from '@/lib/db/client'

const mockGetDb = vi.mocked(getDb)

// Import after mocks
const { findAllSources, getSourceApiKey, upsertSourceConfig } = await import('./sources')

describe('findAllSources', () => {
  it('should call select().from() on the database', async () => {
    const mockSources = [
      { id: '1', name: 'remoteok', config: null },
      { id: '2', name: 'serply', config: { apiKey: 'encrypted' } },
    ]
    const mockFrom = vi.fn().mockResolvedValue(mockSources)
    const mockSelect = vi.fn(() => ({ from: mockFrom }))
    mockGetDb.mockReturnValue({ select: mockSelect } as never)

    const result = await findAllSources()

    expect(mockSelect).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalled()
    expect(result).toEqual(mockSources)
  })
})

describe('upsertSourceConfig', () => {
  it('should update existing source config via transaction', async () => {
    const existing = { id: 'uuid-1', name: 'serply' }
    const updated = { ...existing, config: { apiKey: 'encrypted' } }

    const mockReturning = vi.fn().mockResolvedValue([updated])
    const mockWhere = vi.fn(() => ({ returning: mockReturning }))
    const mockSet = vi.fn(() => ({ where: mockWhere }))
    const mockUpdate = vi.fn(() => ({ set: mockSet }))
    const mockThen = vi.fn().mockResolvedValue(existing)
    const mockLimit = vi.fn(() => ({ then: mockThen }))
    const mockTxWhere = vi.fn(() => ({ limit: mockLimit }))
    const mockFrom = vi.fn(() => ({ where: mockTxWhere }))
    const mockSelect = vi.fn(() => ({ from: mockFrom }))

    const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({ select: mockSelect, update: mockUpdate, insert: vi.fn() })
    })

    mockGetDb.mockReturnValue({ transaction: mockTransaction } as never)

    const result = await upsertSourceConfig('serply', { apiKey: 'encrypted' })

    expect(mockTransaction).toHaveBeenCalled()
    expect(result).toEqual(updated)
  })

  it('should insert new source config when not exists', async () => {
    const newSource = { id: 'new', name: 'serply', config: { apiKey: 'enc' } }

    const mockReturning = vi.fn().mockResolvedValue([newSource])
    const mockValues = vi.fn(() => ({ returning: mockReturning }))
    const mockInsert = vi.fn(() => ({ values: mockValues }))
    const mockThen = vi.fn().mockResolvedValue(null)
    const mockLimit = vi.fn(() => ({ then: mockThen }))
    const mockTxWhere = vi.fn(() => ({ limit: mockLimit }))
    const mockFrom = vi.fn(() => ({ where: mockTxWhere }))
    const mockSelect = vi.fn(() => ({ from: mockFrom }))

    const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({ select: mockSelect, insert: mockInsert, update: vi.fn() })
    })

    mockGetDb.mockReturnValue({ transaction: mockTransaction } as never)

    const result = await upsertSourceConfig('serply', { apiKey: 'enc' })

    expect(result.name).toBe('serply')
  })
})

describe('getSourceApiKey', () => {
  function setupDbMock(results: unknown[]) {
    const mockLimit = vi.fn().mockResolvedValue(results)
    const mockWhere = vi.fn(() => ({ limit: mockLimit }))
    const mockFrom = vi.fn(() => ({ where: mockWhere }))
    const mockSelect = vi.fn(() => ({ from: mockFrom }))
    mockGetDb.mockReturnValue({ select: mockSelect } as never)
  }

  it('should return null if source not found', async () => {
    setupDbMock([])
    const result = await getSourceApiKey('nonexistent')
    expect(result).toBeNull()
  })

  it('should return null if source has no config', async () => {
    setupDbMock([{ name: 'serply', config: null }])
    const result = await getSourceApiKey('serply')
    expect(result).toBeNull()
  })

  it('should decrypt and return API key', async () => {
    setupDbMock([{ name: 'serply', config: { apiKey: 'iv:tag:ciphertext' } }])
    const result = await getSourceApiKey('serply')
    expect(result).toBe('decrypted:iv:tag:ciphertext')
  })

  it('should return null if config has no apiKey', async () => {
    setupDbMock([{ name: 'serply', config: {} }])
    const result = await getSourceApiKey('serply')
    expect(result).toBeNull()
  })
})
