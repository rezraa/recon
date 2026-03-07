import { describe, expect, it, vi } from 'vitest'

// Mock pdf-parse to avoid needing real PDF files in unit tests
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}))

import pdfParse from 'pdf-parse'

import { parseResume } from './resumeParser'

const mockPdfParseFn = vi.mocked(pdfParse)

function mockPdfText(text: string) {
  mockPdfParseFn.mockResolvedValue({ text, numpages: 1, info: {} } as never)
}

describe('parseResume', () => {
  describe('skill extraction', () => {
    it('[P0] should extract comma-separated skills', async () => {
      mockPdfText(`
SKILLS
JavaScript, TypeScript, React, Node.js, PostgreSQL
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toEqual([
        'JavaScript',
        'TypeScript',
        'React',
        'Node.js',
        'PostgreSQL',
      ])
    })

    it('[P0] should extract pipe-separated skills', async () => {
      mockPdfText(`
TECHNICAL SKILLS
Python | Django | Flask | Docker | AWS
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toEqual(['Python', 'Django', 'Flask', 'Docker', 'AWS'])
    })

    it('[P0] should extract bullet-listed skills', async () => {
      mockPdfText(`
SKILLS
• React
• TypeScript
• GraphQL
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toEqual(['React', 'TypeScript', 'GraphQL'])
    })

    it('[P1] should deduplicate skills (case-insensitive)', async () => {
      mockPdfText(`
SKILLS
JavaScript, javascript, JAVASCRIPT, TypeScript
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toEqual(['JavaScript', 'TypeScript'])
    })

    it('[P2] should handle semicolon-separated skills', async () => {
      mockPdfText(`
CORE COMPETENCIES
Java; Spring Boot; Kubernetes
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toEqual(['Java', 'Spring Boot', 'Kubernetes'])
    })
  })

  describe('experience extraction', () => {
    it('[P0] should extract "Title at Company" pattern', async () => {
      mockPdfText(`
EXPERIENCE

Software Engineer at Google
2020 - 2023
Built scalable systems.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toEqual([
        { title: 'Software Engineer', company: 'Google', years: 3 },
      ])
    })

    it('[P0] should extract "Title, Company" pattern', async () => {
      mockPdfText(`
WORK EXPERIENCE

Senior Developer, Acme Corp
2018 - 2022
Led frontend team.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toEqual([
        { title: 'Senior Developer', company: 'Acme Corp', years: 4 },
      ])
    })

    it('[P1] should handle "Present" as end date', async () => {
      mockPdfText(`
PROFESSIONAL EXPERIENCE

Tech Lead at Startup Inc
2021 - Present
Leading engineering team.
`)
      const result = await parseResume(Buffer.from('fake'))
      const currentYear = new Date().getFullYear()
      expect(result.experience).toEqual([
        { title: 'Tech Lead', company: 'Startup Inc', years: currentYear - 2021 },
      ])
    })

    it('[P1] should extract multiple experience entries', async () => {
      mockPdfText(`
EXPERIENCE

Senior Engineer at BigCo
2020 - 2023
Did stuff.

Junior Developer at SmallCo
2017 - 2020
Learned stuff.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(2)
      expect(result.experience[0].title).toBe('Senior Engineer')
      expect(result.experience[1].title).toBe('Junior Developer')
    })

    it('[P2] should return null years when no date range found', async () => {
      mockPdfText(`
EXPERIENCE

Software Engineer, Mystery Corp

Built things.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toEqual([
        { title: 'Software Engineer', company: 'Mystery Corp', years: null },
      ])
    })
  })

  describe('job title extraction', () => {
    it('[P1] should extract job titles from experience entries', async () => {
      mockPdfText(`
EXPERIENCE

Software Engineer at Google
2020 - 2023

Product Manager at Meta
2018 - 2020
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.jobTitles).toContain('Software Engineer')
      expect(result.jobTitles).toContain('Product Manager')
    })
  })

  describe('edge cases', () => {
    it('[P0] should return empty result for empty PDF', async () => {
      mockPdfText('')
      const result = await parseResume(Buffer.from('fake'))
      expect(result).toEqual({ skills: [], experience: [], jobTitles: [] })
    })

    it('[P1] should return empty result for whitespace-only PDF', async () => {
      mockPdfText('   \n\n   ')
      const result = await parseResume(Buffer.from('fake'))
      expect(result).toEqual({ skills: [], experience: [], jobTitles: [] })
    })

    it('[P1] should handle PDF with no recognized sections', async () => {
      mockPdfText('Just some random text without any section headers.')
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toEqual([])
      expect(result.experience).toEqual([])
    })

    it('[P1] should handle PDF with skills but no experience', async () => {
      mockPdfText(`
SKILLS
JavaScript, Python, Go
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toEqual(['JavaScript', 'Python', 'Go'])
      expect(result.experience).toEqual([])
      expect(result.jobTitles).toEqual([])
    })

    it('[P1] should propagate pdf-parse errors', async () => {
      mockPdfParseFn.mockRejectedValue(new Error('Invalid PDF') as never)
      await expect(parseResume(Buffer.from('fake'))).rejects.toThrow('Invalid PDF')
    })
  })
})
