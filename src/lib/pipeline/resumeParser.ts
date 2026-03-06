// pdf-parse v1 uses `export =` which requires this import style
import pdfParse from 'pdf-parse'

export type { ExperienceEntry, ParsedResume } from './resumeTypes'

import type { ExperienceEntry, ParsedResume } from './resumeTypes'

const SECTION_HEADERS: Record<string, string[]> = {
  skills: [
    'SKILLS',
    'TECHNICAL SKILLS',
    'CORE COMPETENCIES',
    'KEY SKILLS',
    'TECHNOLOGIES',
    'PROFICIENCIES',
    'AREAS OF EXPERTISE',
  ],
  experience: [
    'EXPERIENCE',
    'WORK EXPERIENCE',
    'PROFESSIONAL EXPERIENCE',
    'EMPLOYMENT HISTORY',
    'EMPLOYMENT',
    'WORK HISTORY',
  ],
  education: ['EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS'],
  summary: ['SUMMARY', 'OBJECTIVE', 'PROFESSIONAL SUMMARY', 'PROFILE', 'ABOUT ME'],
}

function normalizeHeader(line: string): string {
  return line.replace(/[:\-–—]/g, '').trim().toUpperCase()
}

function isSectionHeader(line: string): string | null {
  const normalized = normalizeHeader(line)
  if (!normalized || normalized.length > 60) return null

  for (const [section, headers] of Object.entries(SECTION_HEADERS)) {
    if (headers.some((h) => normalized === h || normalized.startsWith(h + ' '))) {
      return section
    }
  }

  return null
}

interface Section {
  name: string
  lines: string[]
}

function splitIntoSections(text: string): Section[] {
  const lines = text.split('\n')
  const sections: Section[] = []
  let currentSection: Section = { name: 'preamble', lines: [] }

  for (const line of lines) {
    const sectionName = isSectionHeader(line)
    if (sectionName) {
      if (currentSection.lines.length > 0 || currentSection.name !== 'preamble') {
        sections.push(currentSection)
      }
      currentSection = { name: sectionName, lines: [] }
    } else {
      currentSection.lines.push(line)
    }
  }

  if (currentSection.lines.length > 0) {
    sections.push(currentSection)
  }

  return sections
}

function extractSkills(lines: string[]): string[] {
  const raw = lines
    .join('\n')
    .split(/[,|;•●◦▪\n]/)
    .map((s) => s.replace(/^[\s\-–—*·]+/, '').trim())
    .filter((s) => s.length > 0 && s.length < 60)

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const skill of raw) {
    const key = skill.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(skill)
    }
  }

  return deduped
}

const EXPERIENCE_PATTERN =
  /^(.+?)\s+(?:at|@)\s+(.+?)$/i

// Only match "Title, Company" when the line is short and doesn't start with a verb
const EXPERIENCE_COMMA_PATTERN =
  /^([A-Z][A-Za-z\s/&-]{2,40}),\s+([A-Z][A-Za-z\s.&'-]{2,60})$/

const YEAR_RANGE_PATTERN =
  /(\d{4})\s*[-–—]\s*(\d{4}|[Pp]resent|[Cc]urrent)/

function parseYearsFromRange(match: RegExpMatchArray): number | null {
  const startYear = parseInt(match[1], 10)
  const endStr = match[2]
  const endYear =
    endStr.toLowerCase() === 'present' || endStr.toLowerCase() === 'current'
      ? new Date().getFullYear()
      : parseInt(endStr, 10)

  if (isNaN(startYear) || isNaN(endYear)) return null
  return Math.max(0, endYear - startYear)
}

function extractExperience(lines: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = []
  const text = lines.join('\n')
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim())

  for (const block of blocks) {
    const blockLines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (blockLines.length === 0) continue

    const firstLine = blockLines[0]

    // Try "Title at Company" pattern
    let titleMatch = firstLine.match(EXPERIENCE_PATTERN)
    if (titleMatch) {
      const yearMatch = block.match(YEAR_RANGE_PATTERN)
      entries.push({
        title: titleMatch[1].trim(),
        company: titleMatch[2].trim(),
        years: yearMatch ? parseYearsFromRange(yearMatch) : null,
      })
      continue
    }

    // Try "Title, Company" pattern (only if line looks like a job title)
    titleMatch = firstLine.match(EXPERIENCE_COMMA_PATTERN)
    if (titleMatch) {
      const yearMatch = block.match(YEAR_RANGE_PATTERN)
      entries.push({
        title: titleMatch[1].trim(),
        company: titleMatch[2].trim(),
        years: yearMatch ? parseYearsFromRange(yearMatch) : null,
      })
      continue
    }

    // Try multi-line: first line = title, second line = company or has date range
    if (blockLines.length >= 2) {
      const yearMatch = block.match(YEAR_RANGE_PATTERN)
      if (yearMatch) {
        entries.push({
          title: blockLines[0],
          company: blockLines[1].replace(YEAR_RANGE_PATTERN, '').replace(/[,|]+$/, '').trim() || 'Unknown',
          years: parseYearsFromRange(yearMatch),
        })
      }
    }
  }

  return entries
}

function extractJobTitles(
  experience: ExperienceEntry[],
  summarySections: Section[],
): string[] {
  const titles = new Set<string>()

  for (const entry of experience) {
    titles.add(entry.title)
  }

  for (const section of summarySections) {
    const text = section.lines.join(' ')
    // Look for common title patterns in summary
    const titlePatterns = [
      /(?:experienced|seasoned|senior|junior|lead|principal|staff)\s+([A-Z][a-zA-Z\s]+(?:Engineer|Developer|Designer|Manager|Analyst|Architect|Consultant))/gi,
    ]
    for (const pattern of titlePatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        titles.add(match[0].trim())
      }
    }
  }

  return Array.from(titles)
}

export async function parseResume(buffer: Buffer): Promise<ParsedResume> {
  const pdfData = await pdfParse(buffer)
  const text = pdfData.text

  if (!text || text.trim().length === 0) {
    return { skills: [], experience: [], jobTitles: [] }
  }

  const sections = splitIntoSections(text)

  const skillsSections = sections.filter((s) => s.name === 'skills')
  const experienceSections = sections.filter((s) => s.name === 'experience')
  const summarySections = sections.filter((s) => s.name === 'summary')

  const skills = skillsSections.flatMap((s) => extractSkills(s.lines))
  const experience = experienceSections.flatMap((s) => extractExperience(s.lines))
  const jobTitles = extractJobTitles(experience, summarySections)

  return { skills, experience, jobTitles }
}
