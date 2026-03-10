import { describe, expect, it, vi } from 'vitest'

// Mock LLM module
vi.mock('@/lib/ai/llm', () => ({
  getLLMModel: vi.fn(),
  isModelAvailable: vi.fn(),
}))

import { getLLMModel, isModelAvailable } from '@/lib/ai/llm'
import type { ParsedResume } from '@/lib/pipeline/resumeTypes'
import type { NormalizedJob } from '@/lib/pipeline/types'

import { buildPrompt, extractAxisScores, scoreJob } from './scoring'

const mockIsModelAvailable = vi.mocked(isModelAvailable)
const mockGetLLMModel = vi.mocked(getLLMModel)

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createNormalizedJob(overrides?: Partial<NormalizedJob>): NormalizedJob {
  return {
    externalId: 'test-1',
    sourceName: 'test',
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    descriptionHtml: undefined,
    descriptionText: 'We are looking for a senior software engineer with 5+ years of experience in React, TypeScript, and Node.js.',
    salaryMin: undefined,
    salaryMax: undefined,
    location: undefined,
    isRemote: undefined,
    sourceUrl: 'https://example.com',
    applyUrl: undefined,
    benefits: undefined,
    rawData: {},
    fingerprint: 'abc123',
    searchText: '',
    sources: [],
    discoveredAt: new Date(),
    pipelineStage: 'discovered',
    ...overrides,
  }
}

function createResume(overrides?: Partial<ParsedResume>): ParsedResume {
  return {
    skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'CI/CD'],
    experience: [
      { title: 'Senior Software Engineer', company: 'Previous Corp', years: 7 },
    ],
    jobTitles: ['Senior Software Engineer'],
    ...overrides,
  }
}

function setupLLMMock(response: string) {
  mockIsModelAvailable.mockReturnValue(true)

  const mockSession = {
    prompt: vi.fn().mockResolvedValue(response),
  }
  const mockContext = {}
  const mockLLM = {
    createContext: vi.fn().mockResolvedValue(mockContext),
    createSession: vi.fn().mockReturnValue(mockSession),
    disposeContext: vi.fn().mockResolvedValue(undefined),
  }
  mockGetLLMModel.mockResolvedValue(mockLLM as never)

  return { mockLLM, mockSession, mockContext }
}

// ─── buildPrompt ──────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('[P1] should include resume text and job details', () => {
    const prompt = buildPrompt('Skills: React, TypeScript', 'Software Engineer', 'Build web apps with React.')

    expect(prompt).toContain('Skills: React, TypeScript')
    expect(prompt).toContain('Software Engineer')
    expect(prompt).toContain('Build web apps with React.')
  })

  it('[P1] should request 4-axis scoring format', () => {
    const prompt = buildPrompt('test', 'test', 'test')

    expect(prompt).toContain('Skills:')
    expect(prompt).toContain('Experience:')
    expect(prompt).toContain('Seniority:')
    expect(prompt).toContain('TechStack:')
  })

  it('[P1] should truncate long resume text to 300 chars', () => {
    const longResume = 'a'.repeat(500)
    const prompt = buildPrompt(longResume, 'Title', 'Desc')

    // The resume portion should be sliced to 300
    expect(prompt).not.toContain('a'.repeat(500))
    expect(prompt).toContain('a'.repeat(300))
  })

  it('[P1] should truncate long job description to 400 chars', () => {
    const longDesc = 'b'.repeat(600)
    const prompt = buildPrompt('resume', 'Title', longDesc)

    expect(prompt).not.toContain('b'.repeat(600))
    expect(prompt).toContain('b'.repeat(400))
  })
})

// ─── extractAxisScores ─────────────────────────────────────────────────────

describe('extractAxisScores', () => {
  it('[P1] should parse valid 4-axis response', () => {
    const response = 'Skills: 75\nExperience: 60\nSeniority: 80\nTechStack: 65'
    const scores = extractAxisScores(response)

    expect(scores).toEqual({
      skills: 75,
      experience: 60,
      seniority: 80,
      techStack: 65,
    })
  })

  it('[P1] should handle case-insensitive labels', () => {
    const response = 'skills: 70\nexperience: 50\nseniority: 60\ntechstack: 55'
    const scores = extractAxisScores(response)

    expect(scores).toEqual({
      skills: 70,
      experience: 50,
      seniority: 60,
      techStack: 55,
    })
  })

  it('[P1] should clamp scores above 100 down to 100', () => {
    // Note: regex \d{1,3} won't match negative numbers, so we only test high values
    const response = 'Skills: 150\nExperience: 100\nSeniority: 80\nTechStack: 200'
    const scores = extractAxisScores(response)

    expect(scores).not.toBeNull()
    expect(scores!.skills).toBe(100)
    expect(scores!.experience).toBe(100)
    expect(scores!.seniority).toBe(80)
    expect(scores!.techStack).toBe(100)
  })

  it('[P1] should fallback to single number when 4-axis format is missing', () => {
    const response = '72'
    const scores = extractAxisScores(response)

    expect(scores).toEqual({
      skills: 72,
      experience: 72,
      seniority: 72,
      techStack: 72,
    })
  })

  it('[P1] should return null for unparseable response', () => {
    const response = 'I cannot score this candidate.'
    const scores = extractAxisScores(response)

    expect(scores).toBeNull()
  })

  it('[P1] should return null for out-of-range single number', () => {
    const response = 'Score: 999'
    // 999 is 3 digits but > 100, fallback rejects it
    const scores = extractAxisScores(response)
    expect(scores).toBeNull()
  })

  it('[P1] should prefer 2+ digit numbers over single digits in fallback', () => {
    // "Here are the 4 scores: 72" — should pick 72, not 4
    const response = 'Here are the 4 scores: 72'
    const scores = extractAxisScores(response)

    expect(scores).toEqual({
      skills: 72,
      experience: 72,
      seniority: 72,
      techStack: 72,
    })
  })

  it('[P2] should handle extra whitespace in response', () => {
    const response = '  Skills:  75  \n  Experience:  60  \n  Seniority:  80  \n  TechStack:  65  '
    const scores = extractAxisScores(response)

    expect(scores).toEqual({
      skills: 75,
      experience: 60,
      seniority: 80,
      techStack: 65,
    })
  })
})

// ─── scoreJob ──────────────────────────────────────────────────────────────

describe('scoreJob', () => {
  it('[P1] should throw when model is not available', async () => {
    mockIsModelAvailable.mockReturnValue(false)

    const job = createNormalizedJob()
    const resume = createResume()

    await expect(scoreJob(job, resume)).rejects.toThrow('LLM model not found')
  })

  it('[P1] should throw when getLLMModel returns null', async () => {
    mockIsModelAvailable.mockReturnValue(true)
    mockGetLLMModel.mockResolvedValue(null)

    const job = createNormalizedJob()
    const resume = createResume()

    await expect(scoreJob(job, resume)).rejects.toThrow('Failed to load LLM model')
  })

  it('[P1] should return valid score and breakdown from LLM response', async () => {
    setupLLMMock('Skills: 80\nExperience: 70\nSeniority: 75\nTechStack: 85')

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore, matchBreakdown } = await scoreJob(job, resume)

    // Weighted: 80*0.45 + 70*0.15 + 75*0.15 + 85*0.25 = 36 + 10.5 + 11.25 + 21.25 = 79
    expect(matchScore).toBe(79)
    expect(matchBreakdown.skills.score).toBe(80)
    expect(matchBreakdown.experience.score).toBe(70)
    expect(matchBreakdown.seniority.score).toBe(75)
    expect(matchBreakdown.techStack.score).toBe(85)
  })

  it('[P1] should compute correct weighted average', async () => {
    setupLLMMock('Skills: 90\nExperience: 40\nSeniority: 60\nTechStack: 80')

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore, matchBreakdown } = await scoreJob(job, resume)

    const expected = Math.round(
      matchBreakdown.skills.score * 0.45 +
      matchBreakdown.experience.score * 0.15 +
      matchBreakdown.seniority.score * 0.15 +
      matchBreakdown.techStack.score * 0.25,
    )

    expect(matchScore).toBe(expected)
  })

  it('[P1] should set correct weights in breakdown', async () => {
    setupLLMMock('Skills: 70\nExperience: 60\nSeniority: 50\nTechStack: 80')

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume)

    expect(matchBreakdown.skills.weight).toBe(0.45)
    expect(matchBreakdown.experience.weight).toBe(0.15)
    expect(matchBreakdown.seniority.weight).toBe(0.15)
    expect(matchBreakdown.techStack.weight).toBe(0.25)

    const totalWeight =
      matchBreakdown.skills.weight +
      matchBreakdown.experience.weight +
      matchBreakdown.seniority.weight +
      matchBreakdown.techStack.weight
    expect(totalWeight).toBeCloseTo(1.0)
  })

  it('[P1] should throw on unparseable LLM response', async () => {
    setupLLMMock('I cannot provide a score for this candidate.')

    const job = createNormalizedJob()
    const resume = createResume()

    await expect(scoreJob(job, resume)).rejects.toThrow('unparseable response')
  })

  it('[P1] should dispose LLM context even on error', async () => {
    mockIsModelAvailable.mockReturnValue(true)

    const mockContext = {}
    const mockLLM = {
      createContext: vi.fn().mockResolvedValue(mockContext),
      createSession: vi.fn().mockReturnValue({
        prompt: vi.fn().mockRejectedValue(new Error('inference failed')),
      }),
      disposeContext: vi.fn().mockResolvedValue(undefined),
    }
    mockGetLLMModel.mockResolvedValue(mockLLM as never)

    const job = createNormalizedJob()
    const resume = createResume()

    await expect(scoreJob(job, resume)).rejects.toThrow()
    expect(mockLLM.disposeContext).toHaveBeenCalledWith(mockContext)
  })

  it('[P1] should produce integer matchScore between 0-100', async () => {
    setupLLMMock('Skills: 73\nExperience: 61\nSeniority: 55\nTechStack: 82')

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore } = await scoreJob(job, resume)

    expect(Number.isInteger(matchScore)).toBe(true)
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
  })

  it('[P1] should produce axis scores between 0-100', async () => {
    setupLLMMock('Skills: 73\nExperience: 61\nSeniority: 55\nTechStack: 82')

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume)

    for (const axis of ['skills', 'experience', 'seniority', 'techStack'] as const) {
      expect(matchBreakdown[axis].score).toBeGreaterThanOrEqual(0)
      expect(matchBreakdown[axis].score).toBeLessThanOrEqual(100)
    }
  })

  it('[P2] should include semantic signals in breakdown', async () => {
    setupLLMMock('Skills: 80\nExperience: 70\nSeniority: 75\nTechStack: 85')

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume)

    // Each axis should have semantic signal derived from score
    expect(matchBreakdown.skills.signals.semantic).toBe(0.8)
    expect(matchBreakdown.experience.signals.semantic).toBe(0.7)
    expect(matchBreakdown.seniority.signals.semantic).toBe(0.75)
    expect(matchBreakdown.techStack.signals.semantic).toBe(0.85)
  })
})
