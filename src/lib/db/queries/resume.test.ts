import { describe, expect, it, vi } from 'vitest'

import { createResume } from '@/test-utils/factories/resume.factory'

const mockReturning = vi.fn()
const mockWhere = vi.fn(() => ({ returning: mockReturning }))
const mockSet = vi.fn(() => ({ where: mockWhere }))
const mockLimit = vi.fn()
const mockFrom = vi.fn(() => ({ limit: mockLimit }))
const mockSelect = vi.fn(() => ({ from: mockFrom }))
const mockValues = vi.fn(() => ({ returning: mockReturning }))
const mockInsert = vi.fn(() => ({ values: mockValues }))
const mockUpdate = vi.fn(() => ({ set: mockSet }))
const mockThen = vi.fn()
const mockTxLimit = vi.fn(() => ({ then: mockThen }))
const mockTxFrom = vi.fn(() => ({ limit: mockTxLimit }))
const mockTxSelect = vi.fn(() => ({ from: mockTxFrom }))
const mockTxInsert = vi.fn(() => ({ values: mockValues }))
const mockTxUpdate = vi.fn(() => ({ set: mockSet }))

const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  return fn({
    select: mockTxSelect,
    insert: mockTxInsert,
    update: mockTxUpdate,
  })
})

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  })),
}))

vi.mock('@/lib/db/schema', () => ({
  resumesTable: { id: 'id' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ _eq: [a, b] })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ _sql: strings.join(''), values }),
    { raw: vi.fn() },
  ),
}))

import { getResume, updateResumeParsedData, upsertResume } from './resume'

describe('getResume', () => {
  it('[P1] should return null when no resume exists', async () => {
    mockLimit.mockResolvedValue([])
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
    mockLimit.mockResolvedValue([mockResume])
    const result = await getResume()
    expect(result).toEqual(mockResume)
  })

  it('[P1] should return only the first resume when multiple exist', async () => {
    const first = { id: 'first', fileName: 'first.pdf' }
    const second = { id: 'second', fileName: 'second.pdf' }
    mockLimit.mockResolvedValue([first, second])
    const result = await getResume()
    expect(result).toEqual(first)
  })

  it('[P1] should call limit(1) on the query', async () => {
    mockLimit.mockResolvedValue([])
    await getResume()
    expect(mockLimit).toHaveBeenCalledWith(1)
  })

  it('[P1] should propagate database errors', async () => {
    mockLimit.mockRejectedValue(new Error('Connection refused'))
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
    mockThen.mockResolvedValue(null)
    const inserted = { id: 'new-id', ...data, uploadedAt: new Date(), updatedAt: new Date() }
    mockReturning.mockResolvedValue([inserted])

    const result = await upsertResume(data)
    expect(mockTransaction).toHaveBeenCalled()
    expect(mockTxInsert).toHaveBeenCalled()
    expect(result.id).toBe('new-id')
  })

  it('[P0] should update when existing resume found', async () => {
    mockThen.mockResolvedValue({ id: 'existing-id', fileName: 'old.pdf' })
    const updated = { id: 'existing-id', ...data, uploadedAt: new Date(), updatedAt: new Date() }
    mockReturning.mockResolvedValue([updated])

    const result = await upsertResume(data)
    expect(mockTransaction).toHaveBeenCalled()
    expect(mockTxUpdate).toHaveBeenCalled()
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
    mockLimit.mockResolvedValue([])
    const result = await updateResumeParsedData(data)
    expect(result).toBeNull()
  })

  it('[P1] should update and return resume when it exists', async () => {
    mockLimit.mockResolvedValue([{ id: 'existing-id' }])
    const updated = { id: 'existing-id', parsedData: data.parsedData, skills: data.skills, experience: data.experience }
    mockReturning.mockResolvedValue([updated])

    const result = await updateResumeParsedData(data)
    expect(mockUpdate).toHaveBeenCalled()
    expect(result?.id).toBe('existing-id')
  })
})
