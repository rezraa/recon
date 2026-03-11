import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/resume', () => ({
  getResume: vi.fn(),
}))

vi.mock('@/worker/queues', () => ({
  createRescoreQueue: vi.fn(),
}))

import { getResume } from '@/lib/db/queries/resume'
import { createRescoreQueue } from '@/worker/queues'

import { POST } from './route'

const mockGetResume = vi.mocked(getResume)
const mockCreateRescoreQueue = vi.mocked(createRescoreQueue)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/rescore', () => {
  it('should return 404 when no resume exists', async () => {
    mockGetResume.mockResolvedValue(null)

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.message).toBe('No resume found')
  })

  it('should enqueue rescore job and return 202', async () => {
    mockGetResume.mockResolvedValue({
      id: 'resume-1',
      fileName: 'test.pdf',
      parsedData: { skills: ['TS'], experience: [], jobTitles: [] },
      skills: ['TS'],
      experience: [],
      resumeExtraction: null,
      uploadedAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof getResume> extends Promise<infer T> ? NonNullable<T> : never)

    const mockAdd = vi.fn().mockResolvedValue(undefined)
    const mockClose = vi.fn().mockResolvedValue(undefined)
    mockCreateRescoreQueue.mockReturnValue({ add: mockAdd, close: mockClose } as never)

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.data.status).toBe('rescoring')
    expect(body.data.resumeId).toBe('resume-1')
    expect(mockAdd).toHaveBeenCalledWith(
      'score.batch',
      { resumeId: 'resume-1' },
      expect.objectContaining({ removeOnComplete: true }),
    )
    expect(mockClose).toHaveBeenCalled()
  })

  it('should return 500 when queue throws', async () => {
    mockGetResume.mockResolvedValue({
      id: 'resume-1',
      fileName: 'test.pdf',
      parsedData: { skills: [], experience: [], jobTitles: [] },
      skills: [],
      experience: [],
      resumeExtraction: null,
      uploadedAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof getResume> extends Promise<infer T> ? NonNullable<T> : never)

    mockCreateRescoreQueue.mockImplementation(() => {
      throw new Error('Redis connection failed')
    })

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
    expect(body.error.message).toBe('Internal server error')
  })

  it('should return 500 when getResume throws', async () => {
    mockGetResume.mockRejectedValue(new Error('DB error'))

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
  })
})
