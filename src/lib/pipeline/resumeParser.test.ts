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

  describe('company-header format (company first, title below)', () => {
    it('[P0] should extract from "COMPANY • Location\\tDate" format', async () => {
      mockPdfText(`
EXPERIENCE

GOOGLE.  •  Mountain View, CA\tJanuary 2021 – Present

Search and ads technology

Senior Software Engineer

Built distributed systems for ad serving.
Improved latency by 40%.

AMAZON.  •  Seattle, WA\tMarch 2018 – December 2020

E-commerce giant

Software Development Engineer

Worked on checkout microservices.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(2)
      expect(result.experience[0]).toEqual({
        title: 'Senior Software Engineer',
        company: 'GOOGLE',
        years: expect.any(Number),
      })
      expect(result.experience[1]).toEqual({
        title: 'Software Development Engineer',
        company: 'AMAZON',
        years: 2,
      })
    })

    it('[P0] should handle company header with en-dash and month names in date range', async () => {
      mockPdfText(`
EXPERIENCE & NOTABLE CONTRIBUTIONS

ACME CORP.  •  New York, NY\tAugust 2019 – November 2024

Lead Engineer

Led platform team.

STARTUP INC.  •  San Francisco, CA\tMay 2017 – August 2019

Senior Developer

Built MVP.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(2)
      expect(result.experience[0].title).toBe('Lead Engineer')
      expect(result.experience[0].company).toBe('ACME CORP')
      expect(result.experience[0].years).toBe(5)
      expect(result.experience[1].title).toBe('Senior Developer')
      expect(result.experience[1].company).toBe('STARTUP INC')
      expect(result.experience[1].years).toBe(2)
    })

    it('[P1] should skip taglines and bullet points to find actual job title', async () => {
      mockPdfText(`
EXPERIENCE

FLOWTECH.  •  Austin, TX\tJanuary 2023 – Present

Making software better every day

Staff Quality Assurance Engineer

Led a team of SDETs across multiple projects.
Built an agentic AI system for test automation.
Architected backend testing frameworks from scratch.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(1)
      expect(result.experience[0].title).toBe('Staff Quality Assurance Engineer')
      expect(result.experience[0].company).toBe('FLOWTECH')
    })

    it('[P1] should handle four companies in company-header format', async () => {
      mockPdfText(`
WORK EXPERIENCE

COMPANY A.  •  City A, CA\tJanuary 2023 – Present

Software Engineer

COMPANY B.  •  City B, NY\tJune 2020 – December 2022

Senior Developer

COMPANY C.  •  City C, TX\tMarch 2017 – May 2020

Lead Analyst

COMPANY D.  •  City D, WA\tJanuary 2012 – February 2017

Junior Developer
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(4)
      expect(result.experience.map(e => e.title)).toEqual([
        'Software Engineer',
        'Senior Developer',
        'Lead Analyst',
        'Junior Developer',
      ])
      expect(result.experience.map(e => e.company)).toEqual([
        'COMPANY A',
        'COMPANY B',
        'COMPANY C',
        'COMPANY D',
      ])
    })
  })

  describe('multi-line format (title on first line, company on second)', () => {
    it('[P0] should extract from title-first multi-line format', async () => {
      mockPdfText(`
EXPERIENCE

Software Engineer
Google, Mountain View, CA
2020 – 2023

Built scalable systems.

Data Analyst
Meta, Menlo Park, CA
2017 – 2020

Analyzed user behavior.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(2)
      expect(result.experience[0].title).toBe('Software Engineer')
      expect(result.experience[0].years).toBe(3)
      expect(result.experience[1].title).toBe('Data Analyst')
      expect(result.experience[1].years).toBe(3)
    })
  })

  describe('date range variations', () => {
    it('[P1] should handle "Month Year – Month Year" date ranges', async () => {
      mockPdfText(`
EXPERIENCE

Senior Engineer at BigCo
August 2019 – November 2024
Did things.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience[0].years).toBe(5)
    })

    it('[P1] should handle "Year – Present" with en-dash', async () => {
      mockPdfText(`
EXPERIENCE

Staff Engineer at StartupCo
2022 – Present
Leading team.
`)
      const result = await parseResume(Buffer.from('fake'))
      const currentYear = new Date().getFullYear()
      expect(result.experience[0].years).toBe(currentYear - 2022)
    })

    it('[P1] should handle "Month Year – Current"', async () => {
      mockPdfText(`
EXPERIENCE

DevOps Engineer at CloudCo
March 2021 – Current
Managing infrastructure.
`)
      const result = await parseResume(Buffer.from('fake'))
      const currentYear = new Date().getFullYear()
      expect(result.experience[0].years).toBe(currentYear - 2021)
    })

    it('[P1] should handle em-dash in date range', async () => {
      mockPdfText(`
EXPERIENCE

Frontend Developer at WebCo
2019—2022
Built UIs.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience[0].years).toBe(3)
    })
  })

  describe('section header variations', () => {
    it('[P1] should recognize "RELEVANT EXPERIENCE" header', async () => {
      mockPdfText(`
RELEVANT EXPERIENCE

Backend Engineer at APICo
2020 - 2023
Built APIs.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(1)
      expect(result.experience[0].title).toBe('Backend Engineer')
    })

    it('[P1] should recognize "CAREER HISTORY" header', async () => {
      mockPdfText(`
CAREER HISTORY

Project Manager at ConsultCo
2018 - 2022
Managed projects.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience).toHaveLength(1)
      expect(result.experience[0].title).toBe('Project Manager')
    })

    it('[P1] should recognize "AREAS OF EXPERTISE" as skills', async () => {
      mockPdfText(`
AREAS OF EXPERTISE
Kubernetes, Terraform, AWS, GCP
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills).toContain('Kubernetes')
      expect(result.skills).toContain('Terraform')
    })
  })

  describe('real-world resume patterns', () => {
    it('[P0] should handle resume with skills + experience + education sections', async () => {
      mockPdfText(`
Jane Smith
jane@email.com | (555) 123-4567

SUMMARY
Experienced full-stack developer with 8+ years building web applications.

TECHNICAL SKILLS
JavaScript, TypeScript, React, Node.js, Python, PostgreSQL, Redis, Docker, AWS, Terraform

PROFESSIONAL EXPERIENCE

Senior Full Stack Engineer at Stripe
2021 - Present
Built payment processing infrastructure.
Reduced API latency by 35%.

Software Engineer at Shopify
2018 - 2021
Developed storefront features.

Junior Developer at Local Agency
2015 - 2018
Built client websites.

EDUCATION
BS Computer Science, MIT, 2015
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.skills.length).toBeGreaterThanOrEqual(8)
      expect(result.skills).toContain('TypeScript')
      expect(result.skills).toContain('Docker')
      expect(result.experience).toHaveLength(3)
      expect(result.experience[0].title).toBe('Senior Full Stack Engineer')
      expect(result.experience[0].company).toBe('Stripe')
      expect(result.experience[1].title).toBe('Software Engineer')
      expect(result.experience[1].company).toBe('Shopify')
      expect(result.experience[2].title).toBe('Junior Developer')
      expect(result.experience[2].company).toBe('Local Agency')
      expect(result.jobTitles).toContain('Senior Full Stack Engineer')
      expect(result.jobTitles).toContain('Software Engineer')
    })

    it('[P1] should handle resume with @ symbol in "Title @ Company"', async () => {
      mockPdfText(`
EXPERIENCE

Data Scientist @ Netflix
2020 - 2023
Built recommendation models.
`)
      const result = await parseResume(Buffer.from('fake'))
      expect(result.experience[0].title).toBe('Data Scientist')
      expect(result.experience[0].company).toBe('Netflix')
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
