export interface JobRecord {
  id: string
  externalId: string
  sourceName: string
  title: string | null
  company: string | null
  description: string | null
  salaryMin: number | null
  salaryMax: number | null
  location: string | null
  isRemote: boolean | null
  url: string | null
  benefits: unknown | null
  rawData: unknown | null
  matchScore: number | null
  matchBreakdown: unknown | null
  pipelineStage: string | null
  discoveredAt: Date | null
  reviewedAt: Date | null
  appliedAt: Date | null
  stageChangedAt: Date | null
  isDismissed: boolean | null
  createdAt: Date | null
  updatedAt: Date | null
  searchVector: string | null
}

let jobCounter = 0

export function createJob(overrides?: Partial<JobRecord>): JobRecord {
  jobCounter++
  return {
    id: crypto.randomUUID(),
    externalId: `ext-${Date.now()}-${jobCounter}`,
    sourceName: 'test-source',
    title: 'Software Engineer',
    company: 'Test Corp',
    description: 'Build and maintain software systems.',
    salaryMin: 100000,
    salaryMax: 150000,
    location: 'Remote',
    isRemote: true,
    url: `https://example.com/jobs/${jobCounter}`,
    benefits: null,
    rawData: null,
    matchScore: null,
    matchBreakdown: null,
    pipelineStage: 'discovered',
    discoveredAt: new Date(),
    reviewedAt: null,
    appliedAt: null,
    stageChangedAt: null,
    isDismissed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    searchVector: null,
    ...overrides,
  }
}
