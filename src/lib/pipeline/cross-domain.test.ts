/**
 * Cross-domain persona tests — proves the scoring engine works for ANY profession
 * without hardcoded domain knowledge.
 */
import { describe, expect, it, vi } from 'vitest'

import { PERSONAS } from './__fixtures__/personas'
import { extractSkillMatches } from './skills'

// ─── Mock LLM + Embeddings (unit tests — no real models) ────────────────────

vi.mock('@/lib/ai/llm', () => ({
  getLlm: vi.fn().mockResolvedValue({
    createCompletion: vi.fn().mockResolvedValue({ text: '' }),
  }),
}))

vi.mock('@/lib/ai/models', () => ({
  computeEmbedding: vi.fn().mockResolvedValue(new Float32Array(384).fill(0)),
}))

// ─── Skill Overlap Tests ─────────────────────────────────────────────────────

describe('cross-domain skill overlap', () => {
  for (const persona of PERSONAS) {
    describe(`${persona.name}`, () => {
      it('should find multiple skill matches in relevant job descriptions', () => {
        for (const job of persona.relevantJobs) {
          const matches = extractSkillMatches(job.description, persona.resume.skills)
          expect(
            matches.length,
            `${persona.name} should match skills in "${job.title}" — got: [${matches.join(', ')}]`,
          ).toBeGreaterThanOrEqual(3)
        }
      })

      it('should find few or no skill matches in irrelevant job descriptions', () => {
        for (const job of persona.irrelevantJobs) {
          const matches = extractSkillMatches(job.description, persona.resume.skills)
          expect(
            matches.length,
            `${persona.name} should NOT match many skills in "${job.title}" — got: [${matches.join(', ')}]`,
          ).toBeLessThanOrEqual(2)
        }
      })

      it('should have significant separation between relevant and irrelevant match counts', () => {
        const relevantCounts = persona.relevantJobs.map(
          (job) => extractSkillMatches(job.description, persona.resume.skills).length,
        )
        const irrelevantCounts = persona.irrelevantJobs.map(
          (job) => extractSkillMatches(job.description, persona.resume.skills).length,
        )

        const avgRelevant = relevantCounts.reduce((a, b) => a + b, 0) / relevantCounts.length
        const avgIrrelevant = irrelevantCounts.reduce((a, b) => a + b, 0) / irrelevantCounts.length

        expect(
          avgRelevant - avgIrrelevant,
          `${persona.name}: relevant avg ${avgRelevant.toFixed(1)} vs irrelevant avg ${avgIrrelevant.toFixed(1)}`,
        ).toBeGreaterThanOrEqual(3)
      })
    })
  }
})

// ─── Cross-Persona Mismatch Tests ────────────────────────────────────────────

describe('cross-persona mismatch detection', () => {
  it('each persona finds more skills in own-domain jobs than in other-domain jobs', () => {
    for (const persona of PERSONAS) {
      const ownMatches = persona.relevantJobs.map(
        (job) => extractSkillMatches(job.description, persona.resume.skills).length,
      )
      const avgOwn = ownMatches.reduce((a, b) => a + b, 0) / ownMatches.length

      // Check against every OTHER persona's relevant jobs
      for (const other of PERSONAS) {
        if (other.name === persona.name) continue

        const otherMatches = other.relevantJobs.map(
          (job) => extractSkillMatches(job.description, persona.resume.skills).length,
        )
        const avgOther = otherMatches.reduce((a, b) => a + b, 0) / otherMatches.length

        expect(
          avgOwn,
          `${persona.name} should match more skills in own jobs (${avgOwn.toFixed(1)}) than ${other.name} jobs (${avgOther.toFixed(1)})`,
        ).toBeGreaterThan(avgOther)
      }
    }
  })
})

// ─── Resume Parser Title Extraction (domain-agnostic) ────────────────────────

// Mock pdf-parse for resume parser tests
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}))

import pdfParse from 'pdf-parse'

import { parseResume } from './resumeParser'

const mockPdfParseFn = vi.mocked(pdfParse)

function mockPdfText(text: string) {
  mockPdfParseFn.mockResolvedValue({ text, numpages: 1, info: {} } as never)
}

describe('cross-domain resume title extraction', () => {
  const titleTests = [
    {
      title: 'ICU Registered Nurse',
      company: 'KAISER PERMANENTE',
      resumeText: `
EXPERIENCE

KAISER PERMANENTE.  •  Oakland, CA\tMarch 2019 – Present

ICU Registered Nurse

Administered IV therapy and monitored ventilator patients.
Coordinated with respiratory therapy teams.
`,
    },
    {
      title: 'Journeyman Electrician',
      company: 'MILLER ELECTRIC',
      resumeText: `
WORK EXPERIENCE

MILLER ELECTRIC.  •  Jacksonville, FL\tJune 2017 – Present

Journeyman Electrician

Installed and maintained industrial motor controls.
`,
    },
    {
      title: 'Senior Marketing Manager',
      company: 'SALESFORCE',
      resumeText: `
PROFESSIONAL EXPERIENCE

SALESFORCE.  •  San Francisco, CA\tJanuary 2020 – Present

Senior Marketing Manager

Managed SEO strategy and Google Analytics reporting.
`,
    },
    {
      title: 'Staff Software Engineer',
      company: 'GOOGLE',
      resumeText: `
EXPERIENCE

GOOGLE.  •  Mountain View, CA\tJanuary 2021 – Present

Staff Software Engineer

Built distributed systems for search infrastructure.
`,
    },
  ]

  for (const { title, company, resumeText } of titleTests) {
    it(`should extract "${title}" at ${company} without hardcoded role words`, async () => {
      mockPdfText(resumeText)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(1)
      expect(result.experience[0].title).toBe(title)
      expect(result.experience[0].company).toBe(company)
    })
  }
})
