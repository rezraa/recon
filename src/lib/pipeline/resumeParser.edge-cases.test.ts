import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ParsedResume } from './resumeTypes'

// Mock pdf-parse to control text extraction
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}))

import pdfParse from 'pdf-parse'
import { parseResume } from './resumeParser'

const mockPdfParse = vi.mocked(pdfParse)

function bufferFrom(text: string): Buffer {
  // Mock will ignore the buffer, but we need a valid Buffer arg
  return Buffer.from(text)
}

function setupPdfText(text: string) {
  mockPdfParse.mockResolvedValue({
    text,
    numpages: 1,
    numrender: 1,
    info: {},
    metadata: null,
    version: '1.0',
  } as any)
}

describe('resumeParser edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Skills with very long strings ──────────────────────────────────────

  describe('skills length filtering', () => {
    it('filters out skills longer than 60 characters', async () => {
      const longSkill = 'A'.repeat(61)
      const normalSkill = 'TypeScript'
      setupPdfText(`SKILLS\n${normalSkill}, ${longSkill}`)

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toContain(normalSkill)
      expect(result.skills).not.toContain(longSkill)
    })

    it('keeps skills exactly 59 characters long', async () => {
      const skill59 = 'B'.repeat(59)
      setupPdfText(`SKILLS\n${skill59}`)

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toContain(skill59)
    })
  })

  // ── P0: Experience with em-dash date separator ─────────────────────────────

  describe('em-dash date separator', () => {
    it('parses date range with em-dash (\u2014)', async () => {
      setupPdfText(
        'EXPERIENCE\n\nSoftware Engineer at Google\n2020\u20142023',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      expect(result.experience[0]).toEqual(
        expect.objectContaining({
          title: 'Software Engineer',
          company: 'Google',
          years: 3,
        }),
      )
    })
  })

  // ── P0: Experience with "current" (lowercase) as end date ──────────────────

  describe('lowercase "current" end date', () => {
    it('parses "current" as end date', async () => {
      setupPdfText(
        'EXPERIENCE\n\nSenior Dev at Acme\n2021 - current',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      const currentYear = new Date().getFullYear()
      expect(result.experience[0].years).toBe(currentYear - 2021)
    })

    it('parses "Current" (capitalized) as end date', async () => {
      setupPdfText(
        'EXPERIENCE\n\nDev at Corp\n2019 - Current',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      const currentYear = new Date().getFullYear()
      expect(result.experience[0].years).toBe(currentYear - 2019)
    })
  })

  // ── P0: Section header with colon ──────────────────────────────────────────

  describe('section header with colon', () => {
    it('recognizes "SKILLS:" as skills section', async () => {
      setupPdfText('SKILLS:\nTypeScript, React, Node.js')

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['TypeScript', 'React', 'Node.js']),
      )
    })

    it('recognizes "EXPERIENCE:" as experience section', async () => {
      setupPdfText(
        'EXPERIENCE:\n\nEngineer at StartupCo\n2020 - 2023',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      expect(result.experience[0].company).toBe('StartupCo')
    })
  })

  // ── P0: Section header with dash ──────────────────────────────────────────

  describe('section header with dash', () => {
    it('recognizes "SKILLS - Technical" as skills section', async () => {
      setupPdfText('SKILLS - Technical\nPython, Java, Go')

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['Python', 'Java', 'Go']),
      )
    })
  })

  // ── P1: Mixed delimiters in skills ────────────────────────────────────────

  describe('mixed delimiters in skills section', () => {
    it('parses skills with commas AND bullets in same section', async () => {
      setupPdfText(
        'SKILLS\n\u2022 TypeScript, JavaScript\n\u2022 React, Vue\nPython | Go',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining([
          'TypeScript',
          'JavaScript',
          'React',
          'Vue',
          'Python',
          'Go',
        ]),
      )
    })
  })

  // ── P1: Experience with @ symbol ──────────────────────────────────────────

  describe('experience with @ symbol', () => {
    it('parses "Engineer @ Google" pattern', async () => {
      setupPdfText(
        'EXPERIENCE\n\nSoftware Engineer @ Google\n2020 - 2023',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      expect(result.experience[0]).toEqual(
        expect.objectContaining({
          title: 'Software Engineer',
          company: 'Google',
          years: 3,
        }),
      )
    })
  })

  // ── P1: Multiple skills sections ──────────────────────────────────────────

  describe('multiple skills sections', () => {
    it('merges SKILLS and TECHNICAL SKILLS sections', async () => {
      setupPdfText(
        'SKILLS\nTypeScript, React\n\nTECHNICAL SKILLS\nDocker, Kubernetes',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['TypeScript', 'React', 'Docker', 'Kubernetes']),
      )
    })
  })

  // ── P1: Job titles from summary section ───────────────────────────────────

  describe('job titles from summary', () => {
    it('extracts title from "Experienced Senior Software Engineer..."', async () => {
      setupPdfText(
        'SUMMARY\nExperienced Senior Software Engineer with 10 years of expertise.',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.jobTitles.length).toBeGreaterThanOrEqual(1)
      expect(
        result.jobTitles.some((t) => t.includes('Senior Software Engineer')),
      ).toBe(true)
    })

    it('extracts title from "Lead Data Analyst" in profile', async () => {
      setupPdfText(
        'PROFILE\nSeasoned Lead Data Analyst focused on ML pipelines.',
      )

      const result = await parseResume(bufferFrom(''))

      expect(
        result.jobTitles.some((t) => t.includes('Lead Data Analyst')),
      ).toBe(true)
    })
  })

  // ── P2: Very large resume ─────────────────────────────────────────────────

  describe('very large resume', () => {
    it('handles resume with thousands of lines without crashing', async () => {
      const lines = ['SKILLS', 'TypeScript, React']
      for (let i = 0; i < 2000; i++) {
        lines.push(`Line ${i} of filler content describing work achievements.`)
      }
      setupPdfText(lines.join('\n'))

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['TypeScript', 'React']),
      )
    })
  })

  // ── P2: Unicode characters ────────────────────────────────────────────────

  describe('unicode characters', () => {
    it('handles unicode in skills', async () => {
      setupPdfText('SKILLS\nC++, C#, R\u00e9sum\u00e9 Builder')

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['C++', 'C#', 'R\u00e9sum\u00e9 Builder']),
      )
    })

    it('handles unicode in company names', async () => {
      setupPdfText(
        'EXPERIENCE\n\nDeveloper at Soci\u00e9t\u00e9 G\u00e9n\u00e9rale\n2020 - 2022',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience[0].company).toBe('Soci\u00e9t\u00e9 G\u00e9n\u00e9rale')
    })
  })

  // ── P2: Resume with only education ────────────────────────────────────────

  describe('resume with only education section', () => {
    it('returns empty skills and experience', async () => {
      setupPdfText(
        'EDUCATION\nBachelor of Science in Computer Science\nMIT, 2020',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual([])
      expect(result.experience).toEqual([])
      expect(result.jobTitles).toEqual([])
    })
  })
})
