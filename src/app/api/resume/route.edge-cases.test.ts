import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/resume', () => ({
  getResume: vi.fn(),
  upsertResume: vi.fn(),
  updateResumeParsedData: vi.fn(),
}))

vi.mock('@/lib/pipeline/resumeParser', () => ({
  parseResume: vi.fn(),
}))

import { getResume, updateResumeParsedData, upsertResume } from '@/lib/db/queries/resume'
import { parseResume } from '@/lib/pipeline/resumeParser'
import { createResume } from '@/test-utils/factories/resume.factory'

import { GET, POST } from './route'

const mockGetResume = vi.mocked(getResume)
const mockUpsertResume = vi.mocked(upsertResume)
const mockUpdateResumeParsedData = vi.mocked(updateResumeParsedData)
const mockParseResume = vi.mocked(parseResume)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/resume — file upload edge cases', () => {
  const mockResumeRow = createResume({
    id: 'resume-1',
    fileName: 'my-resume.pdf',
    parsedData: { skills: ['TypeScript'], experience: [], jobTitles: [] },
    skills: ['TypeScript'],
    experience: [],
    uploadedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  })

  it('[P0] should accept a file exactly at the 5MB boundary', async () => {
    const exactContent = new Uint8Array(5 * 1024 * 1024) // exactly 5MB
    const parsedData = { skills: ['Node.js'], experience: [], jobTitles: [] }
    mockParseResume.mockResolvedValue(parsedData)
    mockUpsertResume.mockResolvedValue({ ...mockResumeRow, parsedData })

    const formData = new FormData()
    const file = new File([exactContent], 'exact-5mb.pdf', { type: 'application/pdf' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.id).toBe('resume-1')
    expect(mockParseResume).toHaveBeenCalled()
    expect(mockUpsertResume).toHaveBeenCalled()
  })

  it('[P0] should reject a file with .pdf extension but wrong MIME type', async () => {
    const formData = new FormData()
    const file = new File(['fake content'], 'sneaky.pdf', { type: 'text/plain' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.message).toBe('Please upload a PDF or DOCX file')
    expect(mockParseResume).not.toHaveBeenCalled()
  })

  it('[P0] should use the first file when multiple files are in FormData', async () => {
    const parsedData = { skills: ['Go'], experience: [], jobTitles: [] }
    mockParseResume.mockResolvedValue(parsedData)
    mockUpsertResume.mockResolvedValue({ ...mockResumeRow, fileName: 'first.pdf', parsedData })

    const formData = new FormData()
    const file1 = new File(['pdf-content-1'], 'first.pdf', { type: 'application/pdf' })
    const file2 = new File(['pdf-content-2'], 'second.pdf', { type: 'application/pdf' })
    formData.append('file', file1)
    formData.append('file', file2)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toBeDefined()
    // formData.get('file') returns the first entry
    expect(mockUpsertResume).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'first.pdf' }),
    )
  })

  it('[P1] should return 500 when database upsert fails', async () => {
    const parsedData = { skills: ['Python'], experience: [], jobTitles: [] }
    mockParseResume.mockResolvedValue(parsedData)
    mockUpsertResume.mockRejectedValue(new Error('DB write failed'))

    const formData = new FormData()
    const file = new File(['pdf-content'], 'resume.pdf', { type: 'application/pdf' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const errorJson = await response.json()

    expect(response.status).toBe(500)
    expect(errorJson.error.code).toBe(500)
    expect(errorJson.error.message).toBe('Internal server error')
  })

  it('[P2] should handle concurrent POST requests independently', async () => {
    const parsedData1 = { skills: ['React'], experience: [], jobTitles: [] }
    const parsedData2 = { skills: ['Vue'], experience: [], jobTitles: [] }

    mockParseResume
      .mockResolvedValueOnce(parsedData1)
      .mockResolvedValueOnce(parsedData2)

    mockUpsertResume
      .mockResolvedValueOnce({ ...mockResumeRow, id: 'resume-1', parsedData: parsedData1 })
      .mockResolvedValueOnce({ ...mockResumeRow, id: 'resume-2', parsedData: parsedData2 })

    const formData1 = new FormData()
    formData1.append('file', new File(['pdf1'], 'first.pdf', { type: 'application/pdf' }))

    const formData2 = new FormData()
    formData2.append('file', new File(['pdf2'], 'second.pdf', { type: 'application/pdf' }))

    const req1 = new Request('http://localhost/api/resume', { method: 'POST', body: formData1 })
    const req2 = new Request('http://localhost/api/resume', { method: 'POST', body: formData2 })

    const [response1, response2] = await Promise.all([POST(req1), POST(req2)])
    const [body1, body2] = await Promise.all([response1.json(), response2.json()])

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(body1.data.id).toBe('resume-1')
    expect(body2.data.id).toBe('resume-2')
    expect(mockParseResume).toHaveBeenCalledTimes(2)
    expect(mockUpsertResume).toHaveBeenCalledTimes(2)
  })

  it('[P2] should handle a very large parsed result with hundreds of skills', async () => {
    const manySkills = Array.from({ length: 500 }, (_, i) => `skill-${i}`)
    const parsedData = { skills: manySkills, experience: [], jobTitles: [] }
    mockParseResume.mockResolvedValue(parsedData)
    mockUpsertResume.mockResolvedValue({ ...mockResumeRow, parsedData, skills: manySkills })

    const formData = new FormData()
    const file = new File(['pdf-content'], 'big-skills.pdf', { type: 'application/pdf' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.parsedData.skills).toHaveLength(500)
    expect(mockUpsertResume).toHaveBeenCalledWith(
      expect.objectContaining({ skills: manySkills }),
    )
  })
})

describe('POST /api/resume — JSON data update edge cases', () => {
  it('[P1] should return 500 when request body is malformed JSON', async () => {
    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json!!!',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
  })

  it('[P0] should reject parsedData with wrong shape (skills as string) with 400', async () => {
    const malformedParsedData = { skills: 'not-an-array', experience: 'also-wrong', jobTitles: 42 }

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsedData: malformedParsedData }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toBe('Invalid parsedData format')
    expect(mockUpdateResumeParsedData).not.toHaveBeenCalled()
  })
})

describe('GET /api/resume — edge cases', () => {
  it('[P1] should return 200 with resume data when parsedData fields are null', async () => {
    mockGetResume.mockResolvedValue(createResume({
      id: 'resume-null-fields',
      fileName: 'resume.pdf',
      uploadedAt: new Date('2026-01-01'),
      parsedData: null,
      skills: null,
      experience: null,
      updatedAt: new Date('2026-01-01'),
    }))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual({
      id: 'resume-null-fields',
      fileName: 'resume.pdf',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    })
    // The GET response does not include parsedData, skills, or experience
    expect(body.data.parsedData).toBeUndefined()
    expect(body.data.skills).toBeUndefined()
  })

  it('[P1] should return 500 on database timeout', async () => {
    mockGetResume.mockRejectedValue(new Error('Connection timeout'))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
    expect(body.error.message).toBe('Internal server error')
  })
})
