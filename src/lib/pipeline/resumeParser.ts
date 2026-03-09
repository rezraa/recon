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
    'EXPERIENCE & NOTABLE CONTRIBUTIONS',
    'EXPERIENCE AND NOTABLE CONTRIBUTIONS',
    'CAREER HISTORY',
    'RELEVANT EXPERIENCE',
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
  /(\d{4})\s*[-–—]\s*(?:\w+\s+)?(\d{4}|[Pp]resent|[Cc]urrent)/

// "COMPANY.  •  Location\tDate" or "COMPANY  •  Location  Date" or "COMPANY | Location | Date"
const COMPANY_HEADER_PATTERN =
  /^([A-Z][A-Z\s.&',()-]+?)(?:\s*[•·|]\s*|\s{2,})[\w\s,]+(?:\t|\s{2,}).*\d{4}/

// Job title role words (the noun that defines the role)
const TITLE_ROLE_WORDS = [
  'engineer', 'developer', 'manager', 'director', 'architect', 'analyst',
  'designer', 'consultant', 'specialist', 'coordinator', 'administrator',
  'officer', 'scientist', 'researcher', 'intern', 'associate', 'sdet',
]

// Seniority/modifier words that appear before the role word
const TITLE_MODIFIER_WORDS = [
  'lead', 'senior', 'staff', 'principal', 'vp', 'head', 'junior', 'chief',
  'sr', 'jr',
]

function titleScore(line: string): number {
  const lower = line.toLowerCase()
  if (line.length > 80 || line.length < 5) return 0
  let score = 0
  // Strong signal: contains a role word
  if (TITLE_ROLE_WORDS.some((kw) => lower.includes(kw))) score += 2
  // Bonus: contains a seniority modifier
  if (TITLE_MODIFIER_WORDS.some((kw) => lower.split(/\s+/).includes(kw))) score += 1
  // Penalty: starts with a verb (likely a bullet point)
  if (/^(led|built|created|developed|designed|implemented|established|collaborated|served|facilitated|performed|won|leveraged|instrumented|stood|making|architected)/i.test(lower)) score -= 3
  return score
}

function looksLikeTitle(line: string): boolean {
  return titleScore(line) >= 2
}

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

function extractCompanyName(headerLine: string): string {
  // Strip trailing dots, bullets, locations, dates
  const match = headerLine.match(/^([A-Z][A-Z\s.&',()-]+?)(?:\s*[•·|]|\t|\s{3,})/)
  if (match) return match[1].replace(/[.\s]+$/, '').trim()
  return headerLine.split(/\t/)[0].replace(/[.\s]+$/, '').trim()
}

function extractExperience(lines: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = []
  const nonEmpty = lines.filter((l) => l.trim())

  // Strategy 1: Company-header format (company line with date, title on nearby line)
  const companyBlocks: { company: string; yearMatch: RegExpMatchArray; startIdx: number }[] = []
  for (let i = 0; i < nonEmpty.length; i++) {
    const line = nonEmpty[i]
    if (COMPANY_HEADER_PATTERN.test(line)) {
      const yearMatch = line.match(YEAR_RANGE_PATTERN)
      if (yearMatch) {
        companyBlocks.push({
          company: extractCompanyName(line),
          yearMatch,
          startIdx: i,
        })
      }
    }
  }

  if (companyBlocks.length > 0) {
    for (let ci = 0; ci < companyBlocks.length; ci++) {
      const block = companyBlocks[ci]
      // Search between this company header and the next one (or up to 8 lines)
      const nextBlockIdx = ci + 1 < companyBlocks.length ? companyBlocks[ci + 1].startIdx : nonEmpty.length
      const searchEnd = Math.min(block.startIdx + 8, nextBlockIdx)

      // Find the line with the highest title score
      let bestTitle: string | null = null
      let bestScore = 0
      for (let j = block.startIdx + 1; j < searchEnd; j++) {
        const score = titleScore(nonEmpty[j])
        if (score > bestScore) {
          bestScore = score
          bestTitle = nonEmpty[j].trim()
        }
      }
      if (bestTitle && bestScore >= 2) {
        entries.push({
          title: bestTitle,
          company: block.company,
          years: parseYearsFromRange(block.yearMatch),
        })
      }
    }
    return entries
  }

  // Strategy 2: "Title at Company" or "Title, Company" (original logic)
  const text = lines.join('\n')
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim())

  for (const blk of blocks) {
    const blockLines = blk.split('\n').map((l) => l.trim()).filter(Boolean)
    if (blockLines.length === 0) continue

    const firstLine = blockLines[0]

    let titleMatch = firstLine.match(EXPERIENCE_PATTERN)
    if (titleMatch) {
      const yearMatch = blk.match(YEAR_RANGE_PATTERN)
      entries.push({
        title: titleMatch[1].trim(),
        company: titleMatch[2].trim(),
        years: yearMatch ? parseYearsFromRange(yearMatch) : null,
      })
      continue
    }

    titleMatch = firstLine.match(EXPERIENCE_COMMA_PATTERN)
    if (titleMatch) {
      const yearMatch = blk.match(YEAR_RANGE_PATTERN)
      entries.push({
        title: titleMatch[1].trim(),
        company: titleMatch[2].trim(),
        years: yearMatch ? parseYearsFromRange(yearMatch) : null,
      })
      continue
    }

    if (blockLines.length >= 2) {
      const yearMatch = blk.match(YEAR_RANGE_PATTERN)
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

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  // Default: PDF
  const pdfParse = (await import('pdf-parse')).default
  const pdfData = await pdfParse(buffer)
  return pdfData.text
}

export async function parseResume(buffer: Buffer, mimeType = 'application/pdf'): Promise<ParsedResume> {
  const text = await extractText(buffer, mimeType)

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
