import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(),
}))

vi.mock('@/lib/db/queries/resume', () => ({
  getResume: vi.fn(),
  updateResumeExtraction: vi.fn(),
}))

vi.mock('@/lib/db/queries/preferences', () => ({
  getPreferences: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/adapters/job-detail', () => ({
  fetchJobDetail: vi.fn(),
}))

vi.mock('@/lib/adapters/linkedin-detail', () => ({
  fetchLinkedInDetail: vi.fn(),
}))

vi.mock('@/lib/pipeline/scoring', () => ({
  scoreJob: vi.fn().mockResolvedValue({
    matchScore: 75,
    matchBreakdown: { skills: { score: 60 }, experience: { score: 80 }, salary: { score: 50 }, domainMultiplier: 85 },
  }),
  extractResumeProfile: vi.fn().mockResolvedValue({
    title: 'SWE', domain: 'Tech', seniorityLevel: 'senior',
    yearsExperience: 5, hardSkills: ['React'], softSkills: [], certifications: [],
  }),
  embedProfile: vi.fn().mockResolvedValue({
    hardSkills: new Float32Array(384),
    title: new Float32Array(384),
  }),
}))

vi.mock('../logger', () => ({
  log: vi.fn(),
}))

import { fetchJobDetail } from '@/lib/adapters/job-detail'
import { getDb } from '@/lib/db/client'
import { getResume } from '@/lib/db/queries/resume'
import { scoreJob } from '@/lib/pipeline/scoring'

import { enrichProcessor } from './enrich'

const mockFetchJobDetail = vi.mocked(fetchJobDetail)
const mockGetDb = vi.mocked(getDb)
const mockGetResume = vi.mocked(getResume)
const mockScoreJob = vi.mocked(scoreJob)

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockJob(data: { jobId: string }) {
  return { data } as never
}

function createMockDbRow(overrides?: Record<string, unknown>) {
  return {
    id: 'job-1',
    externalId: 'ext-1',
    sourceName: 'searxng',
    title: 'Software Engineer',
    company: 'TechCorp',
    descriptionText: '',
    descriptionHtml: null,
    salaryMin: null,
    salaryMax: null,
    location: null,
    isRemote: null,
    sourceUrl: 'https://linkedin.com/jobs/view/123',
    partial: true,
    enrichmentAttemptedAt: null,
    extractedProfile: null,
    country: 'US',
    discoveredAt: new Date(),
    pipelineStage: 'discovered',
    matchScore: null,
    matchBreakdown: null,
    ...overrides,
  }
}

function setupDb(rows: unknown[]) {
  const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })
  const mockLimit = vi.fn().mockResolvedValue(rows)
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

  const db = {
    select: mockSelect,
    update: mockUpdate,
  }
  mockGetDb.mockReturnValue(db as never)
  return { db, mockUpdate, mockSet }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('enrichProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] should skip when job is already enriched (partial=false)', async () => {
    setupDb([createMockDbRow({ partial: false })])

    await enrichProcessor(createMockJob({ jobId: 'job-1' }))

    expect(mockFetchJobDetail).not.toHaveBeenCalled()
  })

  it('[P1] should skip when enrichment was attempted within 1 hour', async () => {
    const recentAttempt = new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
    setupDb([createMockDbRow({ enrichmentAttemptedAt: recentAttempt })])

    await enrichProcessor(createMockJob({ jobId: 'job-1' }))

    expect(mockFetchJobDetail).not.toHaveBeenCalled()
  })

  it('[P1] should proceed when enrichment was attempted more than 1 hour ago', async () => {
    const oldAttempt = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    setupDb([createMockDbRow({ enrichmentAttemptedAt: oldAttempt })])
    mockFetchJobDetail.mockResolvedValue({
      descriptionText: 'Full job description here',
      descriptionHtml: '<p>Full job description here</p>',
    })
    mockGetResume.mockResolvedValue({
      id: 'r-1',
      skills: ['React'],
      experience: [],
      resumeExtraction: {
        title: 'SWE', domain: 'Tech', seniorityLevel: 'senior',
        yearsExperience: 5, hardSkills: ['React'], softSkills: [], certifications: [],
      },
    } as never)

    await enrichProcessor(createMockJob({ jobId: 'job-1' }))

    expect(mockFetchJobDetail).toHaveBeenCalledWith('Software Engineer', 'TechCorp')
  })

  it('[P1] should record enrichment_attempted_at before fetching (prevents retry storms)', async () => {
    const { mockUpdate, mockSet } = setupDb([createMockDbRow()])
    mockFetchJobDetail.mockResolvedValue(null) // fetch fails

    await enrichProcessor(createMockJob({ jobId: 'job-1' }))

    // Should have updated enrichmentAttemptedAt
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ enrichmentAttemptedAt: expect.any(Date) }),
    )
  })

  it('[P1] should enrich via SearXNG and re-score', async () => {
    const { mockSet } = setupDb([createMockDbRow()])
    mockFetchJobDetail.mockResolvedValue({
      descriptionText: 'Full description with requirements',
      descriptionHtml: '<p>Full description with requirements</p>',
      salary: { min: 66560 },
    })
    mockGetResume.mockResolvedValue({
      id: 'r-1',
      skills: ['React'],
      experience: [],
      resumeExtraction: {
        title: 'SWE', domain: 'Tech', seniorityLevel: 'senior',
        yearsExperience: 5, hardSkills: ['React'], softSkills: [], certifications: [],
      },
    } as never)

    await enrichProcessor(createMockJob({ jobId: 'job-1' }))

    // Should have called fetchJobDetail with title and company
    expect(mockFetchJobDetail).toHaveBeenCalledWith('Software Engineer', 'TechCorp')

    // Should have called scoreJob
    expect(mockScoreJob).toHaveBeenCalled()

    // Should have updated with score and partial=false
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        matchScore: 75,
        partial: false,
      }),
    )
  })

  it('[P1] should return early when job not found', async () => {
    setupDb([]) // no rows

    await enrichProcessor(createMockJob({ jobId: 'nonexistent' }))

    expect(mockFetchJobDetail).not.toHaveBeenCalled()
  })

  it('[P2] should set partial=false even when no resume exists', async () => {
    const { mockSet } = setupDb([createMockDbRow()])
    mockFetchJobDetail.mockResolvedValue({
      descriptionText: 'Some description',
      descriptionHtml: '<p>Some description</p>',
    })
    mockGetResume.mockResolvedValue(null)

    await enrichProcessor(createMockJob({ jobId: 'job-1' }))

    // Should still mark partial=false (we have the description now)
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ partial: false }),
    )
  })
})
