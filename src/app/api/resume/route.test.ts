import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/resume', () => ({
  getResume: vi.fn(),
  upsertResume: vi.fn(),
  updateResumeParsedData: vi.fn(),
  updateResumeExtraction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/pipeline/resumeParser', () => ({
  parseResume: vi.fn(),
}))

vi.mock('@/lib/pipeline/scoring', () => ({
  extractResumeProfile: vi.fn().mockResolvedValue({
    title: 'Software Engineer',
    domain: 'Software Engineering',
    seniorityLevel: 'senior',
    yearsExperience: 5,
    hardSkills: ['TypeScript', 'React'],
    softSkills: [],
    certifications: [],
  }),
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

describe('GET /api/resume', () => {
  it('[P1] should return 200 with resume data when resume exists', async () => {
    const resume = createResume({
      id: 'test-id',
      fileName: 'resume.pdf',
      uploadedAt: new Date('2026-01-01'),
      parsedData: null,
      skills: null,
      experience: null,
      updatedAt: new Date('2026-01-01'),
    })
    mockGetResume.mockResolvedValue(resume)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual({
      id: 'test-id',
      fileName: 'resume.pdf',
      skills: null,
      uploadedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('[P1] should return 404 when no resume exists', async () => {
    mockGetResume.mockResolvedValue(null)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe(404)
    expect(body.error.message).toBe('No resume found')
  })

  it('[P1] should return 500 on database error', async () => {
    mockGetResume.mockRejectedValue(new Error('DB connection failed'))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
  })
})

describe('POST /api/resume — file upload', () => {
  const mockResumeRow = createResume({
    id: 'resume-1',
    fileName: 'my-resume.pdf',
    parsedData: { skills: ['TypeScript'], experience: [], jobTitles: [] },
    skills: ['TypeScript'],
    experience: [],
    uploadedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  })

  it('[P0] should upload, parse, and return parsed data', async () => {
    const parsedData = { skills: ['TypeScript'], experience: [], jobTitles: [] }
    mockParseResume.mockResolvedValue(parsedData)
    mockUpsertResume.mockResolvedValue(mockResumeRow)

    const formData = new FormData()
    const file = new File(['fake-pdf-content'], 'my-resume.pdf', { type: 'application/pdf' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe('resume-1')
    expect(body.data.fileName).toBe('my-resume.pdf')
    expect(body.data.parsedData).toEqual(parsedData)
    expect(mockParseResume).toHaveBeenCalled()
    expect(mockUpsertResume).toHaveBeenCalledWith({
      fileName: 'my-resume.pdf',
      parsedData,
      skills: parsedData.skills,
      experience: parsedData.experience,
    })
  })

  it('[P0] should reject non-PDF files with 400', async () => {
    const formData = new FormData()
    const file = new File(['not-a-pdf'], 'doc.txt', { type: 'text/plain' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toBe('Please upload a PDF or DOCX file')
    expect(mockParseResume).not.toHaveBeenCalled()
  })

  it('[P0] should reject files larger than 5MB', async () => {
    const largeContent = new Uint8Array(5 * 1024 * 1024 + 1)
    const formData = new FormData()
    const file = new File([largeContent], 'big.pdf', { type: 'application/pdf' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toBe('File size exceeds 5MB limit')
  })

  it('[P0] should return 400 when no file provided', async () => {
    const formData = new FormData()

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toBe('No file provided')
  })

  it('[P1] should return 500 on parse failure', async () => {
    mockParseResume.mockRejectedValue(new Error('Corrupt PDF'))

    const formData = new FormData()
    const file = new File(['bad-pdf'], 'bad.pdf', { type: 'application/pdf' })
    formData.append('file', file)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
  })
})

describe('POST /api/resume — JSON data update', () => {
  it('[P1] should update parsed data and return result', async () => {
    const updatedParsedData = { skills: ['React', 'Go'], experience: [], jobTitles: [] }
    mockUpdateResumeParsedData.mockResolvedValue(createResume({
      id: 'resume-1',
      fileName: 'resume.pdf',
      parsedData: updatedParsedData,
      skills: ['React', 'Go'],
      experience: [],
      uploadedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }))

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsedData: updatedParsedData }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.parsedData).toEqual(updatedParsedData)
  })

  it('[P1] should return 400 when parsedData is missing', async () => {
    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toBe('Invalid parsedData format')
  })

  it('[P1] should return 400 when parsedData has invalid shape', async () => {
    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsedData: { skills: 12345, experience: 'not-array' } }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toBe('Invalid parsedData format')
    expect(mockUpdateResumeParsedData).not.toHaveBeenCalled()
  })

  it('[P1] should return 404 when no resume exists to update', async () => {
    mockUpdateResumeParsedData.mockResolvedValue(null)

    const request = new Request('http://localhost/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsedData: { skills: [], experience: [], jobTitles: [] },
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.message).toBe('No resume found to update')
  })
})
