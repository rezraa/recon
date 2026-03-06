import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/resume', () => ({
  getResume: vi.fn(),
}))

import { getResume } from '@/lib/db/queries/resume'

import { GET } from './route'

const mockGetResume = vi.mocked(getResume)

describe('GET /api/resume', () => {
  it('should return 200 with resume data when resume exists', async () => {
    mockGetResume.mockResolvedValue({
      id: 'test-id',
      fileName: 'resume.pdf',
      uploadedAt: new Date('2026-01-01'),
      parsedData: null,
      skills: null,
      experience: null,
      updatedAt: new Date('2026-01-01'),
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual({
      id: 'test-id',
      fileName: 'resume.pdf',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('should return 404 when no resume exists', async () => {
    mockGetResume.mockResolvedValue(null)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe(404)
    expect(body.error.message).toBe('No resume found')
  })

  it('should return 500 on database error', async () => {
    mockGetResume.mockRejectedValue(new Error('DB connection failed'))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
  })
})
