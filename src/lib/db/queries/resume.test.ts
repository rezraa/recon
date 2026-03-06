import { describe, expect, it, vi } from 'vitest'

const mockLimit = vi.fn()
const mockFrom = vi.fn(() => ({ limit: mockLimit }))
const mockSelect = vi.fn(() => ({ from: mockFrom }))

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
  })),
}))

import { getResume } from './resume'

describe('getResume', () => {
  it('should return null when no resume exists', async () => {
    mockLimit.mockResolvedValue([])
    const result = await getResume()
    expect(result).toBeNull()
  })

  it('should return first resume when one exists', async () => {
    const mockResume = {
      id: 'abc-123',
      fileName: 'resume.pdf',
      parsedData: null,
      skills: null,
      experience: null,
      uploadedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }
    mockLimit.mockResolvedValue([mockResume])
    const result = await getResume()
    expect(result).toEqual(mockResume)
  })

  it('should return only the first resume when multiple exist', async () => {
    const first = { id: 'first', fileName: 'first.pdf' }
    const second = { id: 'second', fileName: 'second.pdf' }
    mockLimit.mockResolvedValue([first, second])
    const result = await getResume()
    expect(result).toEqual(first)
  })

  it('should call limit(1) on the query', async () => {
    mockLimit.mockResolvedValue([])
    await getResume()
    expect(mockLimit).toHaveBeenCalledWith(1)
  })

  it('should propagate database errors', async () => {
    mockLimit.mockRejectedValue(new Error('Connection refused'))
    await expect(getResume()).rejects.toThrow('Connection refused')
  })
})
