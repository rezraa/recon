import { describe, expect, it, vi } from 'vitest'

// Mock LLM module — model is always available in production
vi.mock('@/lib/ai/llm', () => ({
  getLLMModel: vi.fn(),
  isModelAvailable: vi.fn().mockReturnValue(true),
}))

// Mock embeddings module
vi.mock('@/lib/ai/embeddings', () => ({
  computeEmbedding: vi.fn().mockResolvedValue(new Float32Array(384)),
  cosineSimilarity: vi.fn().mockReturnValue(0.5),
}))

import { computeEmbedding, cosineSimilarity } from '@/lib/ai/embeddings'
import { getLLMModel, isModelAvailable } from '@/lib/ai/llm'
import type { NormalizedJob } from '@/lib/pipeline/types'

import {
  computeSalary,
  embedProfile,
  isTitleOnly,
  parseExtraction,
  scaleScore,
  scoreJob,
  scorePartialJob,
  stripBoilerplate,
  type EmbeddedProfile,
  type ProfileExtraction,
} from './scoring'

const mockIsModelAvailable = vi.mocked(isModelAvailable)
const mockGetLLMModel = vi.mocked(getLLMModel)
const mockCosineSimilarity = vi.mocked(cosineSimilarity)
const mockComputeEmbedding = vi.mocked(computeEmbedding)

function setupDefaultLLMMock(response = '{"title":"Software Engineer","domain":"Software Engineering","seniorityLevel":"senior","yearsExperience":5,"hardSkills":["React","TypeScript","Node.js"],"softSkills":["leadership"],"certifications":[]}') {
  mockIsModelAvailable.mockReturnValue(true)
  const mockSession = { prompt: vi.fn().mockResolvedValue(response) }
  const mockContext = {}
  const mockLLM = {
    createContext: vi.fn().mockResolvedValue(mockContext),
    createSession: vi.fn().mockReturnValue(mockSession),
    disposeContext: vi.fn().mockResolvedValue(undefined),
  }
  mockGetLLMModel.mockResolvedValue(mockLLM as never)
  return { mockLLM, mockSession, mockContext }
}

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createNormalizedJob(overrides?: Partial<NormalizedJob>): NormalizedJob {
  return {
    externalId: 'test-1',
    sourceName: 'test',
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    descriptionHtml: undefined,
    descriptionText: 'Requirements: We are looking for a senior software engineer with 5+ years of experience in React, TypeScript, and Node.js. Must know PostgreSQL and Docker.',
    salaryMin: undefined,
    salaryMax: undefined,
    location: undefined,
    isRemote: undefined,
    sourceUrl: 'https://example.com',
    applyUrl: undefined,
    benefits: undefined,
    rawData: {},
    country: 'US',
    fingerprint: 'abc123',
    searchText: '',
    sources: [],
    discoveredAt: new Date(),
    pipelineStage: 'discovered',
    ...overrides,
  }
}

function createResumeProfile(overrides?: Partial<ProfileExtraction>): ProfileExtraction {
  return {
    title: 'Staff Software Development Engineer in Test',
    domain: 'Software Engineering',
    seniorityLevel: 'staff',
    yearsExperience: 16,
    hardSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'CI/CD', 'Selenium', 'Playwright'],
    softSkills: ['leadership', 'mentoring'],
    certifications: [],

    ...overrides,
  }
}

function createResumeEmbeddings(): EmbeddedProfile {
  return {
    hardSkills: new Float32Array(384),
    title: new Float32Array(384),
  }
}

const DEFAULT_JOB_PROFILE: ProfileExtraction = {
  title: 'Senior Software Engineer',
  domain: 'Software Engineering',
  seniorityLevel: 'senior',
  yearsExperience: 5,
  hardSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
  softSkills: ['communication'],
  certifications: [],
}

// ─── stripBoilerplate ────────────────────────────────────────────────────

describe('stripBoilerplate', () => {
  it('[P1] should jump to requirements section when found', () => {
    const text = 'About Us: We are a great company. Our mission is to change the world. Requirements: 5+ years React. Strong TypeScript skills.'
    const result = stripBoilerplate(text)

    expect(result).toMatch(/^Requirements/)
    expect(result).toContain('5+ years React')
    expect(result).not.toContain('About Us')
  })

  it('[P1] should jump to responsibilities section', () => {
    const text = 'Company intro paragraph. What you\'ll do: Build scalable APIs. Deploy to production.'
    const result = stripBoilerplate(text)

    expect(result).toMatch(/^What you'll do/)
    expect(result).toContain('Build scalable APIs')
  })

  it('[P1] should strip sentence-level junk when no section headers found', () => {
    const text = 'About us we are great. Build React applications. We do not discriminate.'
    const result = stripBoilerplate(text)

    expect(result).toContain('Build React applications')
    expect(result).not.toContain('About us we are great')
    expect(result).not.toContain('We do not discriminate')
  })

  it('[P2] should return original text when no boilerplate detected', () => {
    const text = 'Build React apps. 5 years TypeScript. Deploy on AWS.'
    const result = stripBoilerplate(text)

    expect(result).toBe(text)
  })

  it('[P2] should not jump to section if it appears after 70% of text', () => {
    const filler = 'word '.repeat(100)
    const text = filler + 'Requirements: 5 years React.'
    const result = stripBoilerplate(text)

    expect(result).toContain('word')
  })
})

// ─── scaleScore ─────────────────────────────────────────────────────────

describe('scaleScore', () => {
  it('[P1] should return 0 when sim is at or below floor', () => {
    expect(scaleScore(0.25)).toBe(0)
    expect(scaleScore(0.1)).toBe(0)
    expect(scaleScore(0.0)).toBe(0)
  })

  it('[P1] should return 100 when sim is at or above ceil', () => {
    expect(scaleScore(0.75)).toBe(100)
    expect(scaleScore(0.9)).toBe(100)
  })

  it('[P1] should return 50 at midpoint between floor and ceil', () => {
    expect(scaleScore(0.5)).toBe(50)
  })

  it('[P1] should scale linearly between floor and ceil', () => {
    expect(scaleScore(0.375)).toBe(25)
    expect(scaleScore(0.625)).toBe(75)
  })

  it('[P2] should support custom floor and ceil', () => {
    expect(scaleScore(0.3, 0.3, 0.85)).toBe(0)
    expect(scaleScore(0.85, 0.3, 0.85)).toBe(100)
    expect(scaleScore(0.575, 0.3, 0.85)).toBe(50)
  })
})

// ─── parseExtraction ────────────────────────────────────────────────────

describe('parseExtraction', () => {
  it('[P1] should parse valid JSON extraction', () => {
    const raw = '{"title":"SWE","domain":"Tech","seniorityLevel":"senior","yearsExperience":5,"hardSkills":["React","TS"],"softSkills":["comm"],"certifications":[]}'
    const result = parseExtraction(raw)

    expect(result).not.toBeNull()
    expect(result!.title).toBe('SWE')
    expect(result!.hardSkills).toEqual(['React', 'TS'])
    expect(result!.yearsExperience).toBe(5)
  })

  it('[P1] should extract JSON from surrounding text', () => {
    const raw = 'Here is the profile:\n{"title":"SWE","domain":"Tech","seniorityLevel":"mid","yearsExperience":3,"hardSkills":["Go"],"softSkills":[],"certifications":[]}\nDone.'
    const result = parseExtraction(raw)

    expect(result).not.toBeNull()
    expect(result!.title).toBe('SWE')
    expect(result!.hardSkills).toEqual(['Go'])
  })

  it('[P1] should return null for non-JSON input', () => {
    expect(parseExtraction('This is not JSON')).toBeNull()
    expect(parseExtraction('')).toBeNull()
  })

  it('[P1] should handle missing fields with defaults', () => {
    const raw = '{"title":"SWE"}'
    const result = parseExtraction(raw)

    expect(result).not.toBeNull()
    expect(result!.domain).toBe('')
    expect(result!.hardSkills).toEqual([])
    expect(result!.yearsExperience).toBe(0)
  })

  it('[P2] should filter empty strings from skill arrays', () => {
    const raw = '{"title":"SWE","domain":"Tech","seniorityLevel":"mid","yearsExperience":0,"hardSkills":["React","","TS"],"softSkills":[],"certifications":[]}'
    const result = parseExtraction(raw)

    expect(result!.hardSkills).toEqual(['React', 'TS'])
  })

  it('[P2] should clamp negative yearsExperience to 0', () => {
    const raw = '{"title":"SWE","domain":"Tech","seniorityLevel":"mid","yearsExperience":-3,"hardSkills":[],"softSkills":[],"certifications":[]}'
    const result = parseExtraction(raw)

    expect(result!.yearsExperience).toBe(0)
  })
})

// ─── computeSalary ───────────────────────────────────────────────────────

describe('computeSalary', () => {
  it('[P1] should return 100 when target is within range', () => {
    const result = computeSalary(150000, 120000, 180000)
    expect(result.score).toBe(100)
    expect(result.label).toBe('in range')
  })

  it('[P1] should return 50 (neutral) when no target set', () => {
    const result = computeSalary(null, 120000, 180000)
    expect(result.score).toBe(50)
    expect(result.label).toBe('no target')
  })

  it('[P1] should return 50 (neutral) when no job salary posted', () => {
    const result = computeSalary(150000, null, null)
    expect(result.score).toBe(50)
    expect(result.label).toBe('not posted')
  })

  it('[P1] should treat salary of 0 as unset', () => {
    const result = computeSalary(150000, 0, 0)
    expect(result.score).toBe(50)
    expect(result.label).toBe('not posted')
  })

  it('[P1] should scale down when target is above range', () => {
    const result = computeSalary(200000, 100000, 150000)
    expect(result.score).toBeLessThan(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.label).toBe('target above')
  })

  it('[P1] should scale down when target is below range', () => {
    const result = computeSalary(100000, 150000, 200000)
    expect(result.score).toBeLessThan(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.label).toBe('target below')
  })

  it('[P2] should give high score when target is just below range', () => {
    const result = computeSalary(140000, 150000, 200000)
    expect(result.score).toBeGreaterThan(80)
  })

  it('[P2] should give 0 when target is way outside range', () => {
    const result = computeSalary(50000, 200000, 300000)
    expect(result.score).toBe(0)
  })
})

// ─── scoreJob ──────────────────────────────────────────────────────────────

describe('scoreJob', () => {
  it('[P1] should score job using cached job profile (no LLM call)', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchScore, matchBreakdown } = await scoreJob(
      job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE,
    )

    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
    expect(matchBreakdown.skills.score).toBeGreaterThanOrEqual(0)
    expect(matchBreakdown.salary.score).toBe(50) // neutral, no target
    expect(typeof matchBreakdown.domainMultiplier).toBe('number')
  })

  it('[P1] should extract job profile via LLM when no cached profile', async () => {
    const { mockLLM, mockContext } = setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchScore, extractedProfile } = await scoreJob(
      job, resumeProfile, resumeEmb, null,
    )

    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(extractedProfile).toBeDefined()
    expect(extractedProfile!.hardSkills.length).toBeGreaterThan(0)
    expect(mockLLM.createContext).toHaveBeenCalled()
    expect(mockLLM.disposeContext).toHaveBeenCalledWith(mockContext)
  })

  it('[P1] should include salary axis in breakdown', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob({ salaryMin: 120000, salaryMax: 180000 })
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scoreJob(
      job, resumeProfile, resumeEmb, 150000, DEFAULT_JOB_PROFILE,
    )

    expect(matchBreakdown.salary.score).toBe(100) // target in range
    expect(matchBreakdown.salary.weight).toBe(0.30)
  })

  it('[P1] should apply salary-in-range boost (1.15x)', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const jobWithSalary = createNormalizedJob({ salaryMin: 120000, salaryMax: 180000 })
    const jobWithoutSalary = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const withSalary = await scoreJob(jobWithSalary, resumeProfile, resumeEmb, 150000, DEFAULT_JOB_PROFILE)
    const withoutSalary = await scoreJob(jobWithoutSalary, resumeProfile, resumeEmb, 150000, DEFAULT_JOB_PROFILE)

    expect(withSalary.matchScore).toBeGreaterThan(withoutSalary.matchScore)
  })

  it('[P1] should produce integer matchScore between 0-100', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchScore } = await scoreJob(job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE)

    expect(Number.isInteger(matchScore)).toBe(true)
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
  })

  it('[P1] should set correct weights in breakdown', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scoreJob(job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE)

    expect(matchBreakdown.skills.weight).toBe(0.40)
    expect(matchBreakdown.experience.weight).toBe(0.30)
    expect(matchBreakdown.salary.weight).toBe(0.30)

    const totalWeight =
      matchBreakdown.skills.weight +
      matchBreakdown.experience.weight +
      matchBreakdown.salary.weight
    expect(totalWeight).toBeCloseTo(1.0)
  })

  it('[P1] should include domainMultiplier in breakdown', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scoreJob(job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE)

    expect(matchBreakdown.domainMultiplier).toBeGreaterThanOrEqual(0)
    expect(matchBreakdown.domainMultiplier).toBeLessThanOrEqual(100)
  })

  it('[P1] should crush score when domain multiplier is 0 (totally different field)', async () => {
    // Cosine sim = 0.2 → below domain floor (0.3) → domain = 0 → score = 0
    mockCosineSimilarity.mockReturnValue(0.2)

    const job = createNormalizedJob({
      title: 'HR Administrator',
      descriptionText: 'Manage employee records and benefits administration.',
    })
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const hrProfile: ProfileExtraction = {
      title: 'HR Administrator',
      domain: 'Human Resources',
      seniorityLevel: 'mid',
      yearsExperience: 3,
      hardSkills: ['Workday', 'Payroll', 'HRIS', 'ADP'],
      softSkills: ['communication'],
      certifications: ['SHRM-CP'],
  
    }

    const { matchScore, matchBreakdown } = await scoreJob(
      job, resumeProfile, resumeEmb, null, hrProfile,
    )

    expect(matchScore).toBe(0)
    expect(matchBreakdown.domainMultiplier).toBe(0)
  })

  it('[P1] should use fallback path when job profile has 0 hardSkills', async () => {
    mockCosineSimilarity.mockReturnValue(0.3)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const emptyProfile: ProfileExtraction = {
      title: 'Unknown',
      domain: '',
      seniorityLevel: '',
      yearsExperience: 0,
      hardSkills: [],
      softSkills: [],
      certifications: [],
  
    }

    const { matchScore } = await scoreJob(
      job, resumeProfile, resumeEmb, null, emptyProfile,
    )

    // Fallback uses full resume JSON vs job text embedding
    expect(matchScore).toBeGreaterThanOrEqual(0)
    // computeEmbedding called for resume JSON text and job text
    expect(mockComputeEmbedding).toHaveBeenCalled()
  })

  it('[P1] should use fallback path when extraction fails entirely', async () => {
    // LLM returns garbage
    setupDefaultLLMMock('I cannot parse this job.')
    mockCosineSimilarity.mockReturnValue(0.3)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchScore } = await scoreJob(
      job, resumeProfile, resumeEmb, null,
    )

    // Should not throw — uses fallback
    expect(matchScore).toBeGreaterThanOrEqual(0)
  })

  it('[P2] should store semantic similarities in breakdown signals', async () => {
    mockCosineSimilarity.mockReturnValue(0.55)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scoreJob(
      job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE,
    )

    expect(matchBreakdown.skills.signals.semantic).toBe(0.55)
    expect(matchBreakdown.experience.signals.semantic).toBe(0.55)
    expect(matchBreakdown.skills.signals.keyword).toBeNull()
  })

  it('[P2] should not return extractedProfile when using cached profile', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const result = await scoreJob(
      job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE,
    )

    expect(result.extractedProfile).toBeUndefined()
  })
})

// ─── embedProfile ───────────────────────────────────────────────────────

describe('embedProfile', () => {
  it('[P1] should compute embeddings for hardSkills and title', async () => {
    const profile = createResumeProfile()
    const result = await embedProfile(profile)

    expect(result.hardSkills).toBeInstanceOf(Float32Array)
    expect(result.title).toBeInstanceOf(Float32Array)
    // Should call computeEmbedding twice (hardSkills join + title)
    expect(mockComputeEmbedding).toHaveBeenCalledWith(profile.hardSkills.join(', '))
    expect(mockComputeEmbedding).toHaveBeenCalledWith(`${profile.seniorityLevel} ${profile.title}`)
  })

  it('[P2] should embed "none" when hardSkills is empty', async () => {
    const profile = createResumeProfile({ hardSkills: [] })
    await embedProfile(profile)

    expect(mockComputeEmbedding).toHaveBeenCalledWith('none')
  })
})

// ─── isTitleOnly ──────────────────────────────────────────────────────────

describe('isTitleOnly', () => {
  it('[P1] should return true when description is empty', () => {
    expect(isTitleOnly('Software Engineer', '')).toBe(true)
  })

  it('[P1] should return true when description is whitespace', () => {
    expect(isTitleOnly('Software Engineer', '   ')).toBe(true)
  })

  it('[P1] should return true when description equals title', () => {
    expect(isTitleOnly('Software Engineer', 'Software Engineer')).toBe(true)
  })

  it('[P1] should return true when short description contains title', () => {
    expect(isTitleOnly('SDET', 'SDET - Apply now')).toBe(true)
  })

  it('[P1] should return false for full description', () => {
    expect(isTitleOnly(
      'Software Engineer',
      'We are looking for a software engineer with 5+ years of experience in React, TypeScript, and Node.js. Must have strong communication skills.',
    )).toBe(false)
  })

  it('[P2] should return false when description is long even if it contains title', () => {
    const longDesc = 'Software Engineer role. ' + 'Requirements include deep knowledge of distributed systems. '.repeat(5)
    expect(isTitleOnly('Software Engineer', longDesc)).toBe(false)
  })
})

// ─── scorePartialJob ──────────────────────────────────────────────────────

describe('scorePartialJob', () => {
  it('[P1] should produce skills=0 in breakdown', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scorePartialJob('Software Engineer', resumeEmb)

    expect(matchBreakdown.skills.score).toBe(0)
  })

  it('[P1] should produce salary=0 in breakdown', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scorePartialJob('Software Engineer', resumeEmb)

    expect(matchBreakdown.salary.score).toBe(0)
  })

  it('[P1] should compute experience axis from title embedding', async () => {
    mockCosineSimilarity.mockReturnValue(0.6)
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scorePartialJob('Senior SDET', resumeEmb)

    expect(matchBreakdown.experience.score).toBeGreaterThan(0)
    expect(matchBreakdown.experience.signals.semantic).toBe(0.6)
  })

  it('[P1] should embed the job title for comparison', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)
    const resumeEmb = createResumeEmbeddings()

    await scorePartialJob('React Developer', resumeEmb)

    expect(mockComputeEmbedding).toHaveBeenCalledWith('React Developer')
  })

  it('[P1] should return integer matchScore between 0-100', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)
    const resumeEmb = createResumeEmbeddings()

    const { matchScore } = await scorePartialJob('Software Engineer', resumeEmb)

    expect(Number.isInteger(matchScore)).toBe(true)
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
  })
})

// ─── scoreJob partial path integration ────────────────────────────────────

describe('scoreJob — partial path', () => {
  it('[P1] should use partial scoring for title-only job (no LLM call)', async () => {
    mockGetLLMModel.mockClear()
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob({
      descriptionText: '', // title-only
    })
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scoreJob(
      job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE,
    )

    // Partial path: skills=0, salary=0
    expect(matchBreakdown.skills.score).toBe(0)
    expect(matchBreakdown.salary.score).toBe(0)
    // No LLM call should be made
    expect(mockGetLLMModel).not.toHaveBeenCalled()
  })

  it('[P1] should use partial scoring when description equals title', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob({
      title: 'Software Engineer',
      descriptionText: 'Software Engineer',
    })
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scoreJob(
      job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE,
    )

    expect(matchBreakdown.skills.score).toBe(0)
  })

  it('[P1] should use normal scoring for job with full description', async () => {
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob() // has full descriptionText
    const resumeProfile = createResumeProfile()
    const resumeEmb = createResumeEmbeddings()

    const { matchBreakdown } = await scoreJob(
      job, resumeProfile, resumeEmb, null, DEFAULT_JOB_PROFILE,
    )

    // Normal path: skills should NOT be 0
    expect(matchBreakdown.skills.score).toBeGreaterThan(0)
  })
})
