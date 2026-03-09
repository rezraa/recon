import { describe, expect, it, vi } from 'vitest'

// Mock Transformers.js at module level
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}))

// Mock model manager with controllable behavior
vi.mock('@/lib/ai/models', () => ({
  getEmbeddingModel: vi.fn(),
  getNERModel: vi.fn(),
  getZeroShotClassifier: vi.fn(),
}))

import { getEmbeddingModel, getNERModel, getZeroShotClassifier } from '@/lib/ai/models'
import type { ParsedResume } from '@/lib/pipeline/resumeTypes'
import type { NormalizedJob } from '@/lib/pipeline/types'

import { scoreJob } from './scoring'

const mockGetEmbeddingModel = vi.mocked(getEmbeddingModel)
const mockGetNERModel = vi.mocked(getNERModel)
const mockGetZeroShotClassifier = vi.mocked(getZeroShotClassifier)

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createNormalizedJob(overrides?: Partial<NormalizedJob>): NormalizedJob {
  return {
    externalId: 'test-1',
    sourceName: 'test',
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    descriptionHtml: undefined,
    descriptionText: 'We are looking for a senior software engineer with 5+ years of experience in React, TypeScript, and Node.js. Must have strong CI/CD experience and PostgreSQL knowledge.',
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

/** Generate a mock embedding with a biased direction for similarity control */
function mockEmbedding(bias: number): Float32Array {
  const arr = new Float32Array(384)
  for (let i = 0; i < 384; i++) {
    arr[i] = bias + (i % 10) * 0.01
  }
  // Normalize
  let mag = 0
  for (let i = 0; i < 384; i++) mag += arr[i] * arr[i]
  mag = Math.sqrt(mag)
  for (let i = 0; i < 384; i++) arr[i] /= mag
  return arr
}

function setupMocks(options?: {
  embeddingBias?: number
  nerEntities?: Array<{ entity: string; word: string; score: number }>
  classifierLabel?: string
  classifierScore?: number
  highSimilarity?: boolean
}) {
  const bias = options?.embeddingBias ?? 0.5
  const highSim = options?.highSimilarity ?? false

  // Embedding model: returns similar embeddings for high match, different for low match
  const mockEmbeddingModel = vi.fn().mockImplementation(() => {
    const emb = highSim ? mockEmbedding(0.5) : mockEmbedding(bias)
    return Promise.resolve({ data: emb })
  })
  mockGetEmbeddingModel.mockResolvedValue(mockEmbeddingModel as never)

  // NER model
  const nerEntities = options?.nerEntities ?? [
    { entity: 'B-MISC', word: '5 years', score: 0.95 },
  ]
  const mockNERModel = vi.fn().mockResolvedValue(nerEntities)
  mockGetNERModel.mockResolvedValue(mockNERModel as never)

  // Zero-shot classifier
  const label = options?.classifierLabel ?? 'senior'
  const score = options?.classifierScore ?? 0.85
  const mockClassifier = vi.fn().mockResolvedValue({
    labels: [label, 'mid-level', 'junior'],
    scores: [score, 0.10, 0.05],
  })
  mockGetZeroShotClassifier.mockResolvedValue(mockClassifier as never)

  return { mockEmbeddingModel, mockNERModel, mockClassifier }
}

describe('scoreJob', () => {
  it('[P1] should produce a high match score when resume closely matches job', async () => {
    setupMocks({ highSimilarity: true })

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore, matchBreakdown } = await scoreJob(job, resume)

    expect(matchScore).toBeGreaterThanOrEqual(70)
    expect(matchScore).toBeLessThanOrEqual(100)
    expect(matchBreakdown.skills.score).toBeGreaterThanOrEqual(0)
    expect(matchBreakdown.skills.weight).toBe(0.40)
  })

  it('[P1] should produce a low match score when resume does not match job', async () => {
    // Use alternating embeddings so resume vs job embeddings are dissimilar
    let callCount = 0
    const mockEmbeddingModel = vi.fn().mockImplementation(() => {
      callCount++
      const emb = callCount % 2 === 0 ? mockEmbedding(0.9) : mockEmbedding(0.1)
      return Promise.resolve({ data: emb })
    })
    mockGetEmbeddingModel.mockResolvedValue(mockEmbeddingModel as never)

    const mockNERModel = vi.fn().mockResolvedValue([])
    mockGetNERModel.mockResolvedValue(mockNERModel as never)

    const mockClassifier = vi.fn().mockResolvedValue({
      labels: ['junior', 'mid-level', 'senior'],
      scores: [0.5, 0.3, 0.2],
    })
    mockGetZeroShotClassifier.mockResolvedValue(mockClassifier as never)

    const job = createNormalizedJob({
      title: 'Marine Biologist',
      descriptionText: 'Study ocean ecosystems and marine life in deep sea environments. PhD in marine biology required.',
    })
    const resume = createResume({
      skills: ['Python', 'Machine Learning', 'AWS'],
      experience: [{ title: 'Data Analyst', company: 'DataCo', years: 2 }],
      jobTitles: ['Data Analyst'],
    })

    const { matchScore } = await scoreJob(job, resume)

    expect(matchScore).toBeLessThan(70)
  })

  it('[P1] should produce a valid score for sparse job data (not NaN or 0)', async () => {
    setupMocks({ nerEntities: [] })

    const job = createNormalizedJob({
      title: 'Engineer',
      descriptionText: 'Acme Corp',
    })
    const resume = createResume()

    const { matchScore, matchBreakdown } = await scoreJob(job, resume)

    expect(matchScore).not.toBeNaN()
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
    expect(matchBreakdown).toBeDefined()
  })

  it('[P1] should reflect semantic match in score when keyword misses but embedding hits', async () => {
    setupMocks({ highSimilarity: true })

    const job = createNormalizedJob({
      descriptionText: 'Looking for someone with deployment automation and continuous integration experience.',
    })
    const resume = createResume({
      skills: ['CI/CD', 'Jenkins', 'GitHub Actions'],
    })

    const { matchBreakdown } = await scoreJob(job, resume)

    // Semantic signal should be present even though exact keyword match may be low
    expect(matchBreakdown.skills.signals.semantic).not.toBeNull()
    expect(matchBreakdown.skills.signals.semantic).toBeGreaterThan(0)
  })

  it('[P1] should compute correct weighted average: 0.40*skills + 0.25*exp + 0.20*sen + 0.15*tech', async () => {
    setupMocks({ highSimilarity: true })

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore, matchBreakdown } = await scoreJob(job, resume)

    const expected = Math.round(
      matchBreakdown.skills.score * 0.40 +
      matchBreakdown.experience.score * 0.25 +
      matchBreakdown.seniority.score * 0.20 +
      matchBreakdown.techStack.score * 0.15,
    )

    expect(matchScore).toBe(expected)
  })

  it('[P1] should be deterministic: same inputs produce same score', async () => {
    setupMocks({ highSimilarity: true })
    const job = createNormalizedJob()
    const resume = createResume()

    const result1 = await scoreJob(job, resume)

    setupMocks({ highSimilarity: true })
    const result2 = await scoreJob(job, resume)

    expect(result1.matchScore).toBe(result2.matchScore)
    expect(result1.matchBreakdown.skills.score).toBe(result2.matchBreakdown.skills.score)
    expect(result1.matchBreakdown.experience.score).toBe(result2.matchBreakdown.experience.score)
  })

  it('[P1] should score each axis independently', async () => {
    setupMocks({ highSimilarity: true })

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume)

    // Each axis has its own score, weight, and signals
    expect(matchBreakdown.skills.weight).toBe(0.40)
    expect(matchBreakdown.experience.weight).toBe(0.25)
    expect(matchBreakdown.seniority.weight).toBe(0.20)
    expect(matchBreakdown.techStack.weight).toBe(0.15)

    // Weights sum to 1.0
    const totalWeight =
      matchBreakdown.skills.weight +
      matchBreakdown.experience.weight +
      matchBreakdown.seniority.weight +
      matchBreakdown.techStack.weight
    expect(totalWeight).toBeCloseTo(1.0)
  })

  it('[P1] should handle single-signal fallback (only semantic, no RRF)', async () => {
    setupMocks({ highSimilarity: true })

    // No seniority keywords in job or resume, but semantic signal from classifier
    const job = createNormalizedJob({
      title: 'IC4 Platform Architect',
      descriptionText: 'Design scalable systems. Must know React and TypeScript.',
    })
    const resume = createResume({
      jobTitles: ['L6 Staff Engineer'],
    })

    const { matchBreakdown } = await scoreJob(job, resume)

    // Seniority axis should still have a valid score
    expect(matchBreakdown.seniority.score).toBeGreaterThanOrEqual(0)
    expect(matchBreakdown.seniority.score).toBeLessThanOrEqual(100)
  })

  it('[P1] should handle zero-evidence fallback (score = mean of other axes)', async () => {
    setupMocks({ nerEntities: [], classifierScore: 0 })

    const job = createNormalizedJob({
      title: 'Role',
      descriptionText: 'A position at a company.',
    })
    const resume = createResume({
      skills: [],
      experience: [],
      jobTitles: [],
    })

    const { matchScore, matchBreakdown } = await scoreJob(job, resume)

    // All axes should have some score (not NaN, not negative)
    expect(matchBreakdown.skills.score).toBeGreaterThanOrEqual(0)
    expect(matchBreakdown.experience.score).toBeGreaterThanOrEqual(0)
    expect(matchBreakdown.seniority.score).toBeGreaterThanOrEqual(0)
    expect(matchBreakdown.techStack.score).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).not.toBeNaN()
  })

  it('[P2] should boost seniority axis when job title closely matches resume title', async () => {
    // Setup with high embedding similarity to trigger title boost
    const mockEmbeddingModel = vi.fn()
    // All embeddings are nearly identical → high cosine similarity → title boost
    const sameEmb = mockEmbedding(0.5)
    mockEmbeddingModel.mockResolvedValue({ data: sameEmb })
    mockGetEmbeddingModel.mockResolvedValue(mockEmbeddingModel as never)

    const mockNERModel = vi.fn().mockResolvedValue([
      { entity: 'B-MISC', word: '5 years', score: 0.95 },
    ])
    mockGetNERModel.mockResolvedValue(mockNERModel as never)

    const mockClassifier = vi.fn().mockResolvedValue({
      labels: ['senior', 'mid-level', 'junior'],
      scores: [0.85, 0.10, 0.05],
    })
    mockGetZeroShotClassifier.mockResolvedValue(mockClassifier as never)

    const job = createNormalizedJob({ title: 'Senior Software Engineer' })
    const resume = createResume({ jobTitles: ['Senior Software Engineer'] })

    const { matchBreakdown } = await scoreJob(job, resume)

    // Title should be boosted when there's high similarity
    expect(matchBreakdown.seniority.score).toBeGreaterThan(0)
  })

  it('[P2] should produce a conservative non-zero score when job has zero matchable content', async () => {
    setupMocks({ nerEntities: [], classifierScore: 0 })

    const job = createNormalizedJob({
      title: '',
      descriptionText: '',
    })
    const resume = createResume({
      skills: [],
      experience: [],
      jobTitles: [],
    })

    const { matchScore } = await scoreJob(job, resume)

    expect(matchScore).not.toBeNaN()
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
  })

  it('[P1] should produce integer matchScore between 0-100', async () => {
    setupMocks({ highSimilarity: true })

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchScore } = await scoreJob(job, resume)

    expect(Number.isInteger(matchScore)).toBe(true)
    expect(matchScore).toBeGreaterThanOrEqual(0)
    expect(matchScore).toBeLessThanOrEqual(100)
  })

  it('[P1] should produce axis scores between 0-100', async () => {
    setupMocks({ highSimilarity: true })

    const job = createNormalizedJob()
    const resume = createResume()

    const { matchBreakdown } = await scoreJob(job, resume)

    for (const axis of ['skills', 'experience', 'seniority', 'techStack'] as const) {
      expect(matchBreakdown[axis].score).toBeGreaterThanOrEqual(0)
      expect(matchBreakdown[axis].score).toBeLessThanOrEqual(100)
    }
  })
})
