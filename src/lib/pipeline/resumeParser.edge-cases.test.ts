import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  } as unknown as Awaited<ReturnType<typeof pdfParse>>)
}

describe('resumeParser edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('skills length filtering', () => {
    it('[P1] filters out skills longer than 60 characters', async () => {
      const longSkill = 'A'.repeat(61)
      const normalSkill = 'TypeScript'
      setupPdfText(`SKILLS\n${normalSkill}, ${longSkill}`)

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toContain(normalSkill)
      expect(result.skills).not.toContain(longSkill)
    })

    it('[P2] keeps skills exactly 59 characters long', async () => {
      const skill59 = 'B'.repeat(59)
      setupPdfText(`SKILLS\n${skill59}`)

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toContain(skill59)
    })
  })

  describe('em-dash date separator', () => {
    it('[P1] parses date range with em-dash (\u2014)', async () => {
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

  describe('lowercase "current" end date', () => {
    it('[P1] parses "current" as end date', async () => {
      setupPdfText(
        'EXPERIENCE\n\nSenior Dev at Acme\n2021 - current',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      const currentYear = new Date().getFullYear()
      expect(result.experience[0].years).toBe(currentYear - 2021)
    })

    it('[P1] parses "Current" (capitalized) as end date', async () => {
      setupPdfText(
        'EXPERIENCE\n\nDev at Corp\n2019 - Current',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      const currentYear = new Date().getFullYear()
      expect(result.experience[0].years).toBe(currentYear - 2019)
    })
  })

  describe('section header with colon', () => {
    it('[P1] recognizes "SKILLS:" as skills section', async () => {
      setupPdfText('SKILLS:\nTypeScript, React, Node.js')

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['TypeScript', 'React', 'Node.js']),
      )
    })

    it('[P1] recognizes "EXPERIENCE:" as experience section', async () => {
      setupPdfText(
        'EXPERIENCE:\n\nEngineer at StartupCo\n2020 - 2023',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience).toHaveLength(1)
      expect(result.experience[0].company).toBe('StartupCo')
    })
  })

  describe('section header with dash', () => {
    it('[P1] recognizes "SKILLS - Technical" as skills section', async () => {
      setupPdfText('SKILLS - Technical\nPython, Java, Go')

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['Python', 'Java', 'Go']),
      )
    })
  })

  describe('mixed delimiters in skills section', () => {
    it('[P2] parses skills with commas AND bullets in same section', async () => {
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

  describe('experience with @ symbol', () => {
    it('[P1] parses "Engineer @ Google" pattern', async () => {
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

  describe('multiple skills sections', () => {
    it('[P1] merges SKILLS and TECHNICAL SKILLS sections', async () => {
      setupPdfText(
        'SKILLS\nTypeScript, React\n\nTECHNICAL SKILLS\nDocker, Kubernetes',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['TypeScript', 'React', 'Docker', 'Kubernetes']),
      )
    })
  })

  describe('job titles from summary', () => {
    it('[P1] extracts title from "Experienced Senior Software Engineer..."', async () => {
      setupPdfText(
        'SUMMARY\nExperienced Senior Software Engineer with 10 years of expertise.',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.jobTitles.length).toBeGreaterThanOrEqual(1)
      expect(
        result.jobTitles.some((t) => t.includes('Senior Software Engineer')),
      ).toBe(true)
    })

    it('[P1] extracts title from "Lead Data Analyst" in profile', async () => {
      setupPdfText(
        'PROFILE\nSeasoned Lead Data Analyst focused on ML pipelines.',
      )

      const result = await parseResume(bufferFrom(''))

      expect(
        result.jobTitles.some((t) => t.includes('Lead Data Analyst')),
      ).toBe(true)
    })
  })

  describe('very large resume', () => {
    it('[P2] handles resume with thousands of lines without crashing', async () => {
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

  describe('unicode characters', () => {
    it('[P2] handles unicode in skills', async () => {
      setupPdfText('SKILLS\nC++, C#, R\u00e9sum\u00e9 Builder')

      const result = await parseResume(bufferFrom(''))

      expect(result.skills).toEqual(
        expect.arrayContaining(['C++', 'C#', 'R\u00e9sum\u00e9 Builder']),
      )
    })

    it('[P2] handles unicode in company names', async () => {
      setupPdfText(
        'EXPERIENCE\n\nDeveloper at Soci\u00e9t\u00e9 G\u00e9n\u00e9rale\n2020 - 2022',
      )

      const result = await parseResume(bufferFrom(''))

      expect(result.experience[0].company).toBe('Soci\u00e9t\u00e9 G\u00e9n\u00e9rale')
    })
  })

  describe('resume with only education section', () => {
    it('[P2] returns empty skills and experience', async () => {
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
