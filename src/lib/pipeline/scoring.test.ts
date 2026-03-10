import { describe, expect, it, vi } from 'vitest'

// Mock LLM module — model is always available in production
vi.mock('@/lib/ai/llm', () => ({
  getLLMModel: vi.fn(),
  isModelAvailable: vi.fn().mockReturnValue(true),
}))

// Mock embeddings module
vi.mock('@/lib/ai/embeddings', () => ({
  computeEmbedding: vi.fn().mockResolvedValue(new Float32Array(384)),
  cosineSimilarity: vi.fn().mockReturnValue(0.4),
}))

import { getLLMModel, isModelAvailable } from '@/lib/ai/llm'
import { cosineSimilarity } from '@/lib/ai/embeddings'
import type { ParsedResume } from '@/lib/pipeline/resumeTypes'
import type { NormalizedJob } from '@/lib/pipeline/types'

import {
  buildNudgePrompt,
  computeSkills,
  computeSalary,
  computeTechStack,
  parseNudgeResponse,
  scoreJob,
  stripBoilerplate,
} from './scoring'

const mockIsModelAvailable = vi.mocked(isModelAvailable)
const mockGetLLMModel = vi.mocked(getLLMModel)
const mockCosineSimilarity = vi.mocked(cosineSimilarity)

function setupDefaultLLMMock(response = ' 7\nTech: 8\nExperience: 6') {
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

// ─── computeSkills ───────────────────────────────────────────────────────

describe('computeSkills', () => {
  it('[P1] should match single-word skills with word boundaries', () => {
    const result = computeSkills(['React', 'Docker'], 'Build React apps. Use Docker containers.')
    expect(result.matched).toEqual(['React', 'Docker'])
    expect(result.score).toBe(100)
  })

  it('[P1] should not match partial words', () => {
    const result = computeSkills(['React'], 'This is a reactive system.')
    expect(result.matched).toEqual([])
    expect(result.score).toBe(0)
  })

  it('[P1] should match multi-word skills with 60% threshold', () => {
    const result = computeSkills(['CI/CD Pipeline Design'], 'Must have CI/CD pipeline experience.')
    expect(result.matched).toEqual(['CI/CD Pipeline Design'])
  })

  it('[P1] should return 0 for empty skills', () => {
    const result = computeSkills([], 'Some job description')
    expect(result.score).toBe(0)
  })

  it('[P2] should handle special regex chars in skill names', () => {
    const result = computeSkills(['C++', 'C#'], 'Languages: C++, C#, Python')
    expect(result.matched).toContain('C++')
    expect(result.matched).toContain('C#')
  })
})

// ─── computeTechStack ────────────────────────────────────────────────────

describe('computeTechStack', () => {
  it('[P1] should find known tech terms in job text', () => {
    const result = computeTechStack(
      ['React', 'TypeScript', 'Docker'],
      'We use React, TypeScript, Docker, and Kubernetes.',
    )
    expect(result.jobTerms).toContain('react')
    expect(result.jobTerms).toContain('typescript')
    expect(result.jobTerms).toContain('docker')
    expect(result.jobTerms).toContain('kubernetes')
  })

  it('[P1] should compute coverage of job terms by resume skills', () => {
    const result = computeTechStack(
      ['React', 'TypeScript'],
      'We use React, TypeScript, Docker, and Kubernetes.',
    )
    // 2 covered out of 4 job terms = 50%
    expect(result.covered.length).toBe(2)
    expect(result.score).toBe(50)
  })

  it('[P1] should return 0 when no tech terms found in job', () => {
    const result = computeTechStack(['React'], 'Looking for a friendly person to join our team.')
    expect(result.score).toBe(0)
    expect(result.jobTerms).toEqual([])
  })

  it('[P1] should apply minimum denominator to prevent small-denominator inflation', () => {
    // Job with only 1 tech term and 1 match should NOT score 100%
    const result = computeTechStack(
      ['AWS'],
      'Certification with AWS D17.1 and D1.2',
    )
    expect(result.jobTerms).toContain('aws')
    expect(result.covered.length).toBe(1)
    // 1/max(1,4) = 25%, not 100%
    expect(result.score).toBe(25)
  })

  it('[P2] should not match common English words as tech terms', () => {
    const result = computeTechStack(['React'], 'You will rest and go with the team.')
    // "rest" and "go" should NOT be in KNOWN_TECH
    expect(result.jobTerms).not.toContain('rest')
    expect(result.jobTerms).not.toContain('go')
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

  it('[P2] should give high score when target is just below range (job pays more)', () => {
    // Target $140k, job pays $150k-$200k — close, still decent
    const result = computeSalary(140000, 150000, 200000)
    expect(result.score).toBeGreaterThan(80)
  })

  it('[P2] should give 0 when target is way outside range', () => {
    const result = computeSalary(50000, 200000, 300000)
    expect(result.score).toBe(0)
  })
})

// ─── buildNudgePrompt ─────────────────────────────────────────────────────

describe('buildNudgePrompt', () => {
  const defaultAxes = { skills: 60, techStack: 50, experience: 40, salary: 50 }

  it('[P1] should include resume text, job details, and initial math scores', () => {
    const prompt = buildNudgePrompt('Skills: React, TypeScript', 'Software Engineer', 'Build web apps with React.', defaultAxes)

    expect(prompt).toContain('Skills: React, TypeScript')
    expect(prompt).toContain('Software Engineer')
    expect(prompt).toContain('Build web apps with React.')
    expect(prompt).toContain('Skills: 6/10')
    expect(prompt).toContain('Tech: 5/10')
    expect(prompt).toContain('Experience: 4/10')
  })

  it('[P1] should request 3-axis scoring (no salary or seniority)', () => {
    const prompt = buildNudgePrompt('test', 'test', 'test', defaultAxes)

    expect(prompt).toContain('Skills:')
    expect(prompt).toContain('Tech:')
    expect(prompt).toContain('Experience:')
    expect(prompt).not.toContain('Seniority:')
    expect(prompt).toContain('adjust by at most ±2')
  })

  it('[P1] should truncate long resume text to 300 chars', () => {
    const longResume = 'a'.repeat(500)
    const prompt = buildNudgePrompt(longResume, 'Title', 'Desc', defaultAxes)

    expect(prompt).not.toContain('a'.repeat(500))
    expect(prompt).toContain('a'.repeat(300))
  })

  it('[P1] should truncate long job description to 500 chars', () => {
    const longDesc = 'b'.repeat(700)
    const prompt = buildNudgePrompt('resume', 'Title', longDesc, defaultAxes)

    expect(prompt).not.toContain('b'.repeat(700))
    expect(prompt).toContain('b'.repeat(500))
  })

  it('[P1] should strip boilerplate from job description', () => {
    const desc = 'About us we are great. Requirements: 5 years React. Strong TypeScript.'
    const prompt = buildNudgePrompt('resume', 'Title', desc, defaultAxes)

    expect(prompt).toContain('Requirements')
    expect(prompt).not.toContain('About us we are great')
  })
})

// ─── parseNudgeResponse ──────────────────────────────────────────────────

describe('parseNudgeResponse', () => {
  const mathAxes = { skills: 60, techStack: 50, experience: 40, salary: 50 }

  it('[P1] should parse valid 3-axis response and apply clampNudge', () => {
    const response = 'Skills: 7\nTech: 6\nExperience: 5'
    const result = parseNudgeResponse(response, mathAxes)

    expect(result).not.toBeNull()
    // 7*10=70, math=60, delta=+10, clamped: 60+10=70
    expect(result!.skills).toBe(70)
    // 6*10=60, math=50, delta=+10, clamped: 50+10=60
    expect(result!.techStack).toBe(60)
    // 5*10=50, math=40, delta=+10, clamped: 40+10=50
    expect(result!.experience).toBe(50)
    // Salary untouched by LLM
    expect(result!.salary).toBe(50)
  })

  it('[P1] should handle case-insensitive labels', () => {
    const response = 'skills: 7\ntech: 5\nexperience: 4'
    const result = parseNudgeResponse(response, mathAxes)

    expect(result).not.toBeNull()
    expect(result!.skills).toBe(70) // 70 vs math 60, delta +10
  })

  it('[P1] should clamp LLM scores above 10 down to 10', () => {
    const response = 'Skills: 15\nTech: 20\nExperience: 10'
    const result = parseNudgeResponse(response, mathAxes)

    expect(result).not.toBeNull()
    // 10*10=100, math=60, delta clamped to +10: 60+10=70
    expect(result!.skills).toBe(70)
  })

  it('[P1] should handle "Tech Stack:" label with space', () => {
    const response = 'Skills: 7\nTech Stack: 6\nExperience: 5'
    const result = parseNudgeResponse(response, mathAxes)

    expect(result).not.toBeNull()
    expect(result!.techStack).toBe(60)
  })

  it('[P1] should fallback to math scores for missing axes', () => {
    const response = 'Skills: 7'
    const result = parseNudgeResponse(response, mathAxes)

    expect(result).not.toBeNull()
    expect(result!.skills).toBe(70) // nudged
    expect(result!.techStack).toBe(50) // fallback to math
    expect(result!.experience).toBe(40) // fallback to math
  })

  it('[P1] should return null when Skills is missing', () => {
    const response = 'I cannot score this candidate.'
    expect(parseNudgeResponse(response, mathAxes)).toBeNull()
  })

  it('[P1] should return null for completely empty response', () => {
    expect(parseNudgeResponse('', mathAxes)).toBeNull()
  })

  it('[P1] should enforce zero-lock: math=0 means LLM can not override', () => {
    const zeroMath = { skills: 0, techStack: 0, experience: 40, salary: 50 }
    const response = 'Skills: 8\nTech: 7\nExperience: 5'
    const result = parseNudgeResponse(response, zeroMath)

    expect(result).not.toBeNull()
    expect(result!.skills).toBe(0) // zero-locked
    expect(result!.techStack).toBe(0) // zero-locked
    expect(result!.experience).toBe(50) // nudged from 40
  })

  it('[P1] should clamp nudge to ±10 points from math score', () => {
    const highMath = { skills: 80, techStack: 70, experience: 60, salary: 50 }
    // LLM says 2/10 (=20) for skills, math is 80. delta = 20-80 = -60, clamped to -10
    const response = 'Skills: 2\nTech: 7\nExperience: 6'
    const result = parseNudgeResponse(response, highMath)

    expect(result).not.toBeNull()
    expect(result!.skills).toBe(70) // 80 + (-10) = 70
  })

  it('[P2] should prepend "Skills: " when response starts without it', () => {
    const response = '7\nTech: 6\nExperience: 5'
    const result = parseNudgeResponse(response, mathAxes)

    expect(result).not.toBeNull()
    expect(result!.skills).toBe(70)
  })
})

// ─── scoreJob ──────────────────────────────────────────────────────────────

describe('scoreJob', () => {
  it('[P1] should throw when LLM model is not available', async () => {
    mockIsModelAvailable.mockReturnValue(false)
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resume = createResume()

    // Non-REJECT tier job should throw because LLM is required
    await expect(scoreJob(job, resume)).rejects.toThrow('LLM model not found')
  })

  it('[P1] should return hybrid score with math + LLM nudge', async () => {
    setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore, matchBreakdown } = await scoreJob(job, resume)

    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
    expect(matchBreakdown.skills.score).toBeGreaterThan(0)
    expect(matchBreakdown.salary.score).toBe(50) // neutral, no target
  })

  it('[P1] should include salary axis in breakdown', async () => {
    setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.4)

    const job = createNormalizedJob({ salaryMin: 120000, salaryMax: 180000 })
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume, 150000)

    expect(matchBreakdown.salary.score).toBe(100) // target in range
    expect(matchBreakdown.salary.weight).toBe(0.20)
  })

  it('[P1] should apply salary-in-range boost (1.15x)', async () => {
    setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.5)

    const jobWithSalary = createNormalizedJob({ salaryMin: 120000, salaryMax: 180000 })
    const jobWithoutSalary = createNormalizedJob()
    const resume = createResume()

    const withSalary = await scoreJob(jobWithSalary, resume, 150000)
    const withoutSalary = await scoreJob(jobWithoutSalary, resume, 150000)

    expect(withSalary.matchScore).toBeGreaterThan(withoutSalary.matchScore)
  })

  it('[P1] should produce integer matchScore between 0-100', async () => {
    setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.4)

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore } = await scoreJob(job, resume)

    expect(Number.isInteger(matchScore)).toBe(true)
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
  })

  it('[P1] should produce axis scores between 0-100', async () => {
    setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.4)

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume)

    for (const axis of ['skills', 'techStack', 'experience', 'salary'] as const) {
      expect(matchBreakdown[axis].score).toBeGreaterThanOrEqual(0)
      expect(matchBreakdown[axis].score).toBeLessThanOrEqual(100)
    }
  })

  it('[P1] should set correct weights in breakdown', async () => {
    setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.4)

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume)

    expect(matchBreakdown.skills.weight).toBe(0.35)
    expect(matchBreakdown.techStack.weight).toBe(0.25)
    expect(matchBreakdown.experience.weight).toBe(0.20)
    expect(matchBreakdown.salary.weight).toBe(0.20)

    const totalWeight =
      matchBreakdown.skills.weight +
      matchBreakdown.techStack.weight +
      matchBreakdown.experience.weight +
      matchBreakdown.salary.weight
    expect(totalWeight).toBeCloseTo(1.0)
  })

  it('[P1] should REJECT completely irrelevant jobs (skip LLM)', async () => {
    const { mockLLM } = setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.1)

    const job = createNormalizedJob({
      title: 'Hospice Registered Nurse',
      descriptionText: 'Provide compassionate end-of-life care to patients in their homes.',
    })
    const resume = createResume()

    const { matchScore } = await scoreJob(job, resume)

    expect(matchScore).toBeLessThan(15)
    // REJECT tier: LLM should NOT be called
    expect(mockLLM.createContext).not.toHaveBeenCalled()
  })

  it('[P1] should apply LLM nudge and dispose context', async () => {
    const { mockLLM, mockContext } = setupDefaultLLMMock()
    mockCosineSimilarity.mockReturnValue(0.5)

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore } = await scoreJob(job, resume)

    expect(matchScore).toBeGreaterThan(0)
    expect(mockLLM.createContext).toHaveBeenCalled()
    expect(mockLLM.disposeContext).toHaveBeenCalledWith(mockContext)
  })

  it('[P2] should cap UNLIKELY tier at 50', async () => {
    // LLM returns high scores, but math is in UNLIKELY tier (15-45)
    setupDefaultLLMMock(' 10\nTech: 10\nExperience: 10')
    // Cosine sim 0.35 → experience ~37 after scaling (0.35-0.2)/0.4*100
    mockCosineSimilarity.mockReturnValue(0.35)

    // Job with no tech terms and no skill overlap — only experience contributes
    // Math: skills=0*0.35 + tech=0*0.25 + exp=37*0.20 + salary=50*0.20 = 0+0+7.4+10 = 17
    // 17 is in UNLIKELY tier (15-45)
    const job = createNormalizedJob({
      title: 'Technical Program Manager',
      descriptionText: 'Coordinate cross-functional teams to deliver complex programs on schedule.',
    })
    const resume = createResume({ skills: ['Leadership'] }) // no tech overlap

    const { matchScore } = await scoreJob(job, resume)

    // UNLIKELY tier caps at 50 even if LLM nudge tries to push higher
    expect(matchScore).toBeLessThanOrEqual(50)
  })
})
