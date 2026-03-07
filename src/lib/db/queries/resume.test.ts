import { describe, expect, it, vi } from 'vitest'

import { createResume } from '@/test-utils/factories/resume.factory'
import { createDrizzleMock, drizzleOrmMock } from '@/test-utils/mocks/drizzle'

const drizzle = createDrizzleMock()

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => drizzle.db),
}))

vi.mock('@/lib/db/schema', () => ({
  resumesTable: { id: 'id' },
}))

vi.mock('drizzle-orm', () => drizzleOrmMock)

import { getResume, updateResumeParsedData, upsertResume } from './resume'

describe('getResume', () => {
  it('[P1] should return null when no resume exists', async () => {
    drizzle.mockLimit.mockResolvedValue([])
    const result = await getResume()
    expect(result).toBeNull()
  })

  it('[P1] should return first resume when one exists', async () => {
    const mockResume = createResume({
      id: 'abc-123',
      fileName: 'resume.pdf',
      parsedData: null,
      skills: null,
      experience: null,
      uploadedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    })
    drizzle.mockLimit.mockResolvedValue([mockResume])
    const result = await getResume()
    expect(result).toEqual(mockResume)
  })

  it('[P1] should return only the first resume when multiple exist', async () => {
    const first = { id: 'first', fileName: 'first.pdf' }
    const second = { id: 'second', fileName: 'second.pdf' }
    drizzle.mockLimit.mockResolvedValue([first, second])
    const result = await getResume()
    expect(result).toEqual(first)
  })

  it('[P1] should call limit(1) on the query', async () => {
    drizzle.mockLimit.mockResolvedValue([])
    await getResume()
    expect(drizzle.mockLimit).toHaveBeenCalledWith(1)
  })

  it('[P1] should propagate database errors', async () => {
    drizzle.mockLimit.mockRejectedValue(new Error('Connection refused'))
    await expect(getResume()).rejects.toThrow('Connection refused')
  })
})

describe('upsertResume', () => {
  const data = {
    fileName: 'resume.pdf',
    parsedData: { skills: ['JS'], experience: [], jobTitles: [] },
    skills: ['JS'],
    experience: [],
  }

  it('[P0] should insert when no existing resume', async () => {
    drizzle.mockThen.mockResolvedValue(null)
    const inserted = { id: 'new-id', ...data, uploadedAt: new Date(), updatedAt: new Date() }
    drizzle.mockReturning.mockResolvedValue([inserted])

    const result = await upsertResume(data)
    expect(drizzle.mockTransaction).toHaveBeenCalled()
    expect(drizzle.mockTxInsert).toHaveBeenCalled()
    expect(result.id).toBe('new-id')
  })

  it('[P0] should update when existing resume found', async () => {
    drizzle.mockThen.mockResolvedValue({ id: 'existing-id', fileName: 'old.pdf' })
    const updated = { id: 'existing-id', ...data, uploadedAt: new Date(), updatedAt: new Date() }
    drizzle.mockReturning.mockResolvedValue([updated])

    const result = await upsertResume(data)
    expect(drizzle.mockTransaction).toHaveBeenCalled()
    expect(drizzle.mockTxUpdate).toHaveBeenCalled()
    expect(result.id).toBe('existing-id')
  })
})

describe('updateResumeParsedData', () => {
  const data = {
    parsedData: { skills: ['Go'], experience: [], jobTitles: [] },
    skills: ['Go'],
    experience: [],
  }

  it('[P1] should return null when no resume exists', async () => {
    drizzle.mockLimit.mockResolvedValue([])
    const result = await updateResumeParsedData(data)
    expect(result).toBeNull()
  })

  it('[P1] should update and return resume when it exists', async () => {
    drizzle.mockLimit.mockResolvedValue([{ id: 'existing-id' }])
    const updated = { id: 'existing-id', parsedData: data.parsedData, skills: data.skills, experience: data.experience }
    drizzle.mockReturning.mockResolvedValue([updated])

    const result = await updateResumeParsedData(data)
    expect(drizzle.mockUpdate).toHaveBeenCalled()
    expect(result?.id).toBe('existing-id')
  })
})
