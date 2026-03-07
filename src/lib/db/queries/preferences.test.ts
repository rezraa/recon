import { describe, expect, it, vi } from 'vitest'

import { createPreferences } from '@/test-utils/factories/preferences.factory'
import { createDrizzleMock, drizzleOrmMock } from '@/test-utils/mocks/drizzle'

const drizzle = createDrizzleMock()

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => drizzle.db),
}))

vi.mock('@/lib/db/schema', () => ({
  preferencesTable: { id: 'id' },
}))

vi.mock('drizzle-orm', () => drizzleOrmMock)

import { getPreferences, upsertPreferences } from './preferences'

describe('getPreferences', () => {
  it('[P1] should return null when no preferences exist', async () => {
    drizzle.mockLimit.mockResolvedValue([])
    const result = await getPreferences()
    expect(result).toBeNull()
  })

  it('[P1] should return first preferences when they exist', async () => {
    const prefs = createPreferences({ id: 'pref-123' })
    drizzle.mockLimit.mockResolvedValue([prefs])
    const result = await getPreferences()
    expect(result).toEqual(prefs)
  })

  it('[P1] should call limit(1) on the query', async () => {
    drizzle.mockLimit.mockResolvedValue([])
    await getPreferences()
    expect(drizzle.mockLimit).toHaveBeenCalledWith(1)
  })

  it('[P1] should propagate database errors', async () => {
    drizzle.mockLimit.mockRejectedValue(new Error('Connection refused'))
    await expect(getPreferences()).rejects.toThrow('Connection refused')
  })
})

describe('upsertPreferences', () => {
  const data = {
    targetTitles: ['Software Engineer'],
    salaryMin: 80000,
    salaryMax: 150000,
    locations: ['Remote'],
    remotePreference: 'remote_only',
  }

  it('[P1] should insert when no existing preferences', async () => {
    drizzle.mockThen.mockResolvedValue(null)
    const inserted = createPreferences({ id: 'new-id' })
    drizzle.mockReturning.mockResolvedValue([inserted])

    const result = await upsertPreferences(data)
    expect(drizzle.mockTransaction).toHaveBeenCalled()
    expect(drizzle.mockTxInsert).toHaveBeenCalled()
    expect(result.id).toBe('new-id')
  })

  it('[P1] should update when existing preferences found', async () => {
    drizzle.mockThen.mockResolvedValue({ id: 'existing-id' })
    const updated = createPreferences({ id: 'existing-id' })
    drizzle.mockReturning.mockResolvedValue([updated])

    const result = await upsertPreferences(data)
    expect(drizzle.mockTransaction).toHaveBeenCalled()
    expect(drizzle.mockTxUpdate).toHaveBeenCalled()
    expect(result.id).toBe('existing-id')
  })

  it('[P1] should handle null salary values', async () => {
    drizzle.mockThen.mockResolvedValue(null)
    const inserted = createPreferences({ salaryMin: null, salaryMax: null })
    drizzle.mockReturning.mockResolvedValue([inserted])

    const result = await upsertPreferences({
      ...data,
      salaryMin: null,
      salaryMax: null,
    })
    expect(result.salaryMin).toBeNull()
    expect(result.salaryMax).toBeNull()
  })
})
