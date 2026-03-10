import { describe, expect, it } from 'vitest'

// These tests require real embedding + LLM models (not available in CI)
const skipInCI = !!process.env.CI

import type { ParsedResume } from '@/lib/pipeline/resumeTypes'
import type { NormalizedJob } from '@/lib/pipeline/types'

import labeledJobs from './__fixtures__/labeled-jobs.json'
import { scoreJob } from './scoring'

// ─── Test Resume (software engineer profile) ─────────────────────────────────

const TEST_RESUME: ParsedResume = {
  skills: [
    'TypeScript',
    'React',
    'Node.js',
    'PostgreSQL',
    'Redis',
    'Docker',
    'Kubernetes',
    'CI/CD',
    'GraphQL',
    'REST APIs',
    'Git',
    'Tailwind CSS',
    'Next.js',
    'Vitest',
    'BullMQ',
  ],
  experience: [
    { title: 'Senior Software Engineer', company: 'Tech Corp', years: 7 },
    { title: 'Software Engineer', company: 'Startup Inc', years: 3 },
  ],
  jobTitles: ['Senior Software Engineer', 'Software Engineer'],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface LabeledJob {
  title: string
  company: string
  description: string
  label: 'relevant' | 'irrelevant'
  category: string
}

function toNormalizedJob(labeled: LabeledJob): NormalizedJob {
  return {
    externalId: `test-${labeled.title.toLowerCase().replace(/\s+/g, '-')}`,
    sourceName: 'test',
    title: labeled.title,
    company: labeled.company,
    descriptionHtml: undefined,
    descriptionText: labeled.description,
    salaryMin: undefined,
    salaryMax: undefined,
    location: undefined,
    isRemote: undefined,
    sourceUrl: 'https://example.com',
    applyUrl: undefined,
    benefits: undefined,
    rawData: {},
    country: 'US',
    fingerprint: 'test',
    searchText: '',
    sources: [],
    discoveredAt: new Date(),
    pipelineStage: 'discovered',
  }
}

function getJobsByCategory(category: string): LabeledJob[] {
  return (labeledJobs as LabeledJob[]).filter((j) => j.category === category)
}

function getJobsByLabel(label: string): LabeledJob[] {
  return (labeledJobs as LabeledJob[]).filter((j) => j.label === label)
}

// ─── Integration Tests (math-first hybrid scoring) ──────────────────────────

describe.skipIf(skipInCI)('scoring integration — math-first hybrid calibration', () => {
  // Embedding model load + scoring all jobs
  const TIMEOUT = 120_000

  it(
    'should score relevant IC engineering jobs above 20 on average (math-only, no salary)',
    async () => {
      const relevantJobs = getJobsByLabel('relevant')
      const scores: number[] = []

      for (const labeled of relevantJobs) {
        const job = toNormalizedJob(labeled)
        const { matchScore } = await scoreJob(job, TEST_RESUME)
        scores.push(matchScore)
        console.log(`  [relevant] ${labeled.title} @ ${labeled.company}: ${matchScore}`)
      }

      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      console.log(`  Relevant average: ${avg.toFixed(1)}`)
      // Math-only without salary data produces lower scores than LLM-only
      // With salary data, these would be higher
      expect(avg).toBeGreaterThan(20)
    },
    TIMEOUT,
  )

  it(
    'should score clearly irrelevant jobs below 15 on average',
    async () => {
      const irrelevantJobs = getJobsByCategory('clearly-irrelevant')
      const scores: number[] = []

      for (const labeled of irrelevantJobs) {
        const job = toNormalizedJob(labeled)
        const { matchScore } = await scoreJob(job, TEST_RESUME)
        scores.push(matchScore)
        console.log(`  [irrelevant] ${labeled.title} @ ${labeled.company}: ${matchScore}`)
      }

      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      console.log(`  Clearly irrelevant average: ${avg.toFixed(1)}`)
      expect(avg).toBeLessThan(15)
    },
    TIMEOUT,
  )

  it(
    'should score management false positives below 40 on average',
    async () => {
      const mgmtJobs = getJobsByCategory('management-false-positive')
      const scores: number[] = []

      for (const labeled of mgmtJobs) {
        const job = toNormalizedJob(labeled)
        const { matchScore } = await scoreJob(job, TEST_RESUME)
        scores.push(matchScore)
        console.log(`  [mgmt-fp] ${labeled.title} @ ${labeled.company}: ${matchScore}`)
      }

      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      console.log(`  Management false positive average: ${avg.toFixed(1)}`)
      expect(avg).toBeLessThan(40)
    },
    TIMEOUT,
  )

  it(
    'should score adjacent-but-wrong engineering below 25 on average',
    async () => {
      const adjacentJobs = getJobsByCategory('adjacent-wrong-engineering')
      const scores: number[] = []

      for (const labeled of adjacentJobs) {
        const job = toNormalizedJob(labeled)
        const { matchScore } = await scoreJob(job, TEST_RESUME)
        scores.push(matchScore)
        console.log(`  [adjacent] ${labeled.title} @ ${labeled.company}: ${matchScore}`)
      }

      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      console.log(`  Adjacent-wrong engineering average: ${avg.toFixed(1)}`)
      expect(avg).toBeLessThan(25)
    },
    TIMEOUT,
  )

  it(
    'should not score any irrelevant job above 50 (hard ceiling)',
    async () => {
      const irrelevantJobs = getJobsByLabel('irrelevant')
      const violations: string[] = []

      for (const labeled of irrelevantJobs) {
        const job = toNormalizedJob(labeled)
        const { matchScore } = await scoreJob(job, TEST_RESUME)

        if (matchScore > 50) {
          violations.push(`${labeled.title} @ ${labeled.company}: ${matchScore} (category: ${labeled.category})`)
        }
      }

      if (violations.length > 0) {
        console.log('  Hard ceiling violations (irrelevant jobs > 50):')
        violations.forEach((v) => console.log(`    ${v}`))
      }

      expect(violations).toHaveLength(0)
    },
    TIMEOUT,
  )

  it(
    'should produce per-axis differentiation for relevant jobs (variance > 5)',
    async () => {
      const testJobs = getJobsByCategory('relevant-ic').slice(0, 3)
      let anyDifferentiated = false

      for (const labeled of testJobs) {
        const job = toNormalizedJob(labeled)
        const { matchBreakdown } = await scoreJob(job, TEST_RESUME)

        const axes = [
          matchBreakdown.skills.score,
          matchBreakdown.requirements.score,
          matchBreakdown.experience.score,
          matchBreakdown.salary.score,
        ]

        const mean = axes.reduce((a, b) => a + b, 0) / axes.length
        const variance = axes.reduce((sum, v) => sum + (v - mean) ** 2, 0) / axes.length

        console.log(
          `  [differentiation] ${labeled.title}: Skills=${matchBreakdown.skills.score} Req=${matchBreakdown.requirements.score} Exp=${matchBreakdown.experience.score} Salary=${matchBreakdown.salary.score} (var=${variance.toFixed(1)})`,
        )

        if (variance > 5) anyDifferentiated = true
      }

      expect(anyDifferentiated).toBe(true)
    },
    TIMEOUT,
  )

  it(
    'should boost score when salary is in range',
    async () => {
      const testJobs = getJobsByCategory('relevant-ic').slice(0, 1)
      const labeled = testJobs[0]
      const job = toNormalizedJob(labeled)

      // Score without salary
      const withoutSalary = await scoreJob(job, TEST_RESUME)

      // Score with salary in range
      const jobWithSalary = { ...job, salaryMin: 120000, salaryMax: 200000 }
      const withSalary = await scoreJob(jobWithSalary, TEST_RESUME, 150000)

      console.log(`  Without salary: ${withoutSalary.matchScore}`)
      console.log(`  With salary (in range): ${withSalary.matchScore}`)

      expect(withSalary.matchScore).toBeGreaterThan(withoutSalary.matchScore)
    },
    TIMEOUT,
  )
})
