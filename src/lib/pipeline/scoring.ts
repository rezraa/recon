import { computeEmbedding, cosineSimilarity } from '@/lib/ai/embeddings'
import { getNERModel, getZeroShotClassifier } from '@/lib/ai/models'

import type { ParsedResume } from './resumeTypes'
import { computeRRFScore } from './rrf'
import type { MatchBreakdown, NormalizedJob, ScoringAxisResult, Signal } from './types'

// ─── Constants ─────────────────────────────────────────────────────────────

const WEIGHTS = {
  skills: 0.40,
  experience: 0.25,
  seniority: 0.20,
  techStack: 0.15,
} as const

const SENIORITY_TERMS = [
  'junior', 'entry', 'associate',
  'mid', 'intermediate',
  'senior', 'lead', 'principal', 'staff', 'director', 'vp',
] as const

// ─── Type helpers for Transformers.js pipeline outputs ─────────────────────

interface NEREntity {
  entity: string
  word: string
  score: number
}

function flattenNEROutput(output: unknown): NEREntity[] {
  if (!Array.isArray(output)) return []
  const flat = output.flat() as NEREntity[]
  return flat.filter((e) => e && typeof e.entity === 'string' && typeof e.score === 'number')
}

interface ZeroShotResult {
  labels: string[]
  scores: number[]
}

function normalizeZeroShotOutput(output: unknown): ZeroShotResult {
  if (output == null) return { labels: [], scores: [] }
  if (Array.isArray(output)) {
    return output.length > 0 ? normalizeZeroShotOutput(output[0]) : { labels: [], scores: [] }
  }
  const obj = output as Record<string, unknown>
  return {
    labels: Array.isArray(obj.labels) ? (obj.labels as string[]) : [],
    scores: Array.isArray(obj.scores) ? (obj.scores as number[]) : [],
  }
}

// ─── Utility: Convert similarity score (0-1) to RRF rank (1-100) ──────────

function scoreToRank(score: number): number {
  return Math.max(1, Math.ceil((1 - score) * 100))
}

// ─── Extract tech terms from job text ──────────────────────────────────────

const TECH_TERM_REGEX = /\b[A-Z][a-zA-Z+#.]*(?:\.js|\.ts|\.py|\.go|\.rs)?\b|\b[a-z]+(?:sql|db|mq|js|ml)\b/gi

/**
 * Extract technology/tool terms from job text.
 * Used by Tech Stack axis to count how many job requirements the resume covers.
 */
function extractTechTerms(jobText: string): string[] {
  const matches = jobText.match(TECH_TERM_REGEX) ?? []
  // Deduplicate case-insensitively and filter short terms
  const seen = new Set<string>()
  const terms: string[] = []
  for (const m of matches) {
    const lower = m.toLowerCase()
    if (lower.length >= 2 && !seen.has(lower)) {
      seen.add(lower)
      terms.push(m)
    }
  }
  return terms
}

// ─── Skills Axis (40% weight) ──────────────────────────────────────────────
// Measures: "what fraction of YOUR skills does the job mention?"

function computeSkillsKeyword(resumeSkills: string[], jobText: string): number {
  if (resumeSkills.length === 0) return 0
  const lower = jobText.toLowerCase()
  const matches = resumeSkills.filter((skill) => lower.includes(skill.toLowerCase()))
  return matches.length / resumeSkills.length
}

async function computeSkillsSemantic(
  resumeSkills: string[],
  jobText: string,
): Promise<number> {
  if (resumeSkills.length === 0) return 0
  const skillsText = resumeSkills.join(', ')
  const [skillsEmb, jobEmb] = await Promise.all([
    computeEmbedding(skillsText),
    computeEmbedding(jobText),
  ])
  return Math.max(0, cosineSimilarity(skillsEmb, jobEmb))
}

// ─── Experience Axis (25% weight) ──────────────────────────────────────────

const YEARS_REGEX = /(\d+)\+?\s*(?:years?|yrs?)/gi

function extractYearsFromText(text: string): number[] {
  const matches = [...text.matchAll(YEARS_REGEX)]
  return matches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n))
}

function computeExperienceKeyword(resume: ParsedResume, jobText: string): number {
  const jobYears = extractYearsFromText(jobText)
  if (jobYears.length === 0) return 0

  const resumeYears = resume.experience
    .map((e) => e.years)
    .filter((y): y is number => y !== null)

  if (resumeYears.length === 0) return 0

  const maxResumeYears = Math.max(...resumeYears)
  const requiredYears = Math.max(...jobYears)

  if (maxResumeYears >= requiredYears) return 1.0
  return Math.max(0, maxResumeYears / requiredYears)
}

async function computeExperienceSemantic(
  resume: ParsedResume,
  jobText: string,
): Promise<number> {
  if (resume.experience.length === 0) return 0

  const ner = await getNERModel()
  const rawEntities = await ner(jobText)
  const entities = flattenNEROutput(rawEntities)

  // Extract MISC entities that might contain experience info
  const experienceEntities = entities.filter((e) => e.score > 0.5 && e.entity.includes('MISC'))

  if (experienceEntities.length === 0) return 0

  // Use embedding similarity between resume experience text and extracted entities
  const resumeExpText = resume.experience
    .map((e) => `${e.title} at ${e.company}${e.years ? ` for ${e.years} years` : ''}`)
    .join('. ')
  const entityText = experienceEntities.map((e) => e.word).join(' ')

  const [resumeEmb, entityEmb] = await Promise.all([
    computeEmbedding(resumeExpText),
    computeEmbedding(entityText),
  ])

  return Math.max(0, cosineSimilarity(resumeEmb, entityEmb))
}

// ─── Seniority Axis (20% weight) ───────────────────────────────────────────

function computeSeniorityKeyword(resume: ParsedResume, jobTitle: string, jobText: string): number {
  const jobLower = (jobTitle + ' ' + jobText).toLowerCase()
  const resumeTitlesLower = resume.jobTitles.map((t) => t.toLowerCase())

  const jobSeniorityTerms = SENIORITY_TERMS.filter((term) => jobLower.includes(term))
  if (jobSeniorityTerms.length === 0) return 0

  const resumeSeniorityTerms = SENIORITY_TERMS.filter((term) =>
    resumeTitlesLower.some((t) => t.includes(term)),
  )

  if (resumeSeniorityTerms.length === 0) return 0

  // Check for overlap in seniority terms
  const overlap = jobSeniorityTerms.filter((t) => resumeSeniorityTerms.includes(t))
  return overlap.length > 0 ? 1.0 : 0.3
}

async function computeSenioritySemantic(
  resume: ParsedResume,
  jobTitle: string,
): Promise<{ score: number; titleBoost: boolean }> {
  if (resume.jobTitles.length === 0) return { score: 0, titleBoost: false }

  const classifier = await getZeroShotClassifier()
  const seniorityLabels = ['junior', 'mid-level', 'senior', 'lead', 'principal', 'staff', 'director']

  const jobRaw = await classifier(jobTitle, seniorityLabels)
  const jobResult = normalizeZeroShotOutput(jobRaw)
  const jobTopLabel = jobResult.labels[0] ?? ''
  const jobTopScore = jobResult.scores[0] ?? 0

  // Compute job title embedding once, outside the loop (H3 fix)
  const jobTitleEmb = await computeEmbedding(jobTitle)

  // Classify resume titles
  let bestMatch = 0
  let titleBoost = false

  for (const resumeTitle of resume.jobTitles) {
    const resumeRaw = await classifier(resumeTitle, seniorityLabels)
    const resumeResult = normalizeZeroShotOutput(resumeRaw)
    const resumeTopLabel = resumeResult.labels[0] ?? ''

    if (resumeTopLabel === jobTopLabel) {
      bestMatch = Math.max(bestMatch, jobTopScore)
    }

    // Title boost: check embedding similarity between job title and resume titles
    const resumeEmb = await computeEmbedding(resumeTitle)
    const sim = cosineSimilarity(jobTitleEmb, resumeEmb)
    if (sim > 0.8) {
      titleBoost = true
    }
  }

  return { score: bestMatch, titleBoost }
}

// ─── Tech Stack Axis (15% weight) ─────────────────────────────────────────
// Measures: "what fraction of the JOB's tech requirements does the resume cover?"
// Different from Skills: Skills asks "how many of your skills are relevant?"
// Tech Stack asks "how many of the job's tech needs can you fill?"

function computeTechStackKeyword(resumeSkills: string[], jobText: string): number {
  const jobTechTerms = extractTechTerms(jobText)
  if (jobTechTerms.length === 0) return 0
  if (resumeSkills.length === 0) return 0

  const resumeLower = resumeSkills.map((s) => s.toLowerCase())
  const covered = jobTechTerms.filter((term) =>
    resumeLower.some((skill) =>
      skill.includes(term.toLowerCase()) || term.toLowerCase().includes(skill),
    ),
  )
  return covered.length / jobTechTerms.length
}

async function computeTechStackSemantic(
  resumeSkills: string[],
  jobText: string,
): Promise<number> {
  if (resumeSkills.length === 0) return 0
  const techText = resumeSkills.join(', ')
  const [techEmb, jobEmb] = await Promise.all([
    computeEmbedding(techText),
    computeEmbedding(jobText),
  ])
  return Math.max(0, cosineSimilarity(techEmb, jobEmb))
}

// ─── Axis Fusion ───────────────────────────────────────────────────────────

function fuseAxis(
  keyword: number | null,
  semantic: number | null,
  weight: number,
): ScoringAxisResult {
  let score: number

  if (keyword !== null && semantic !== null) {
    // Both signals: fuse via RRF
    const signals: (Signal | null)[] = [
      { rank: scoreToRank(keyword) },
      { rank: scoreToRank(semantic) },
    ]
    score = Math.round(computeRRFScore(signals) * 100)
  } else if (keyword !== null) {
    // Single signal: scale directly to 0-100
    score = Math.round(keyword * 100)
  } else if (semantic !== null) {
    // Single signal: scale directly to 0-100
    score = Math.round(semantic * 100)
  } else {
    // No signals: will be filled in by caller with mean of other axes
    score = -1 // sentinel value
  }

  return {
    score,
    weight,
    signals: { keyword, semantic },
  }
}

// ─── Fill Zero-Evidence Axes ───────────────────────────────────────────────

function fillZeroEvidenceAxes(breakdown: MatchBreakdown): void {
  const axes: (keyof MatchBreakdown)[] = ['skills', 'experience', 'seniority', 'techStack']
  const sentinel = axes.filter((k) => breakdown[k].score === -1)
  const scored = axes.filter((k) => breakdown[k].score !== -1)

  if (sentinel.length === 0) return

  if (scored.length === 0) {
    // All axes have no signals — conservative score
    for (const key of sentinel) {
      breakdown[key].score = 25
    }
    return
  }

  const mean = Math.round(scored.reduce((sum, k) => sum + breakdown[k].score, 0) / scored.length)

  for (const key of sentinel) {
    breakdown[key].score = mean
  }
}

// ─── Main Scoring Function ─────────────────────────────────────────────────

export async function scoreJob(
  job: NormalizedJob,
  resume: ParsedResume,
): Promise<{ matchScore: number; matchBreakdown: MatchBreakdown }> {
  const jobText = job.descriptionText

  // ─── Skills Axis ───────────────────────────────────────────────────────
  const skillsKeyword = resume.skills.length > 0 ? computeSkillsKeyword(resume.skills, jobText) : null
  const skillsSemantic = resume.skills.length > 0 ? await computeSkillsSemantic(resume.skills, jobText) : null
  const skills = fuseAxis(skillsKeyword, skillsSemantic, WEIGHTS.skills)

  // ─── Experience Axis ───────────────────────────────────────────────────
  const expKeyword = computeExperienceKeyword(resume, jobText)
  const expKeywordSignal = expKeyword > 0 || extractYearsFromText(jobText).length > 0 ? expKeyword : null
  const expSemantic = resume.experience.length > 0 ? await computeExperienceSemantic(resume, jobText) : null
  const experience = fuseAxis(expKeywordSignal, expSemantic, WEIGHTS.experience)

  // ─── Seniority Axis ───────────────────────────────────────────────────
  const senKeyword = computeSeniorityKeyword(resume, job.title, jobText)
  const senKeywordSignal = senKeyword > 0 ? senKeyword : null
  const senSemResult = resume.jobTitles.length > 0
    ? await computeSenioritySemantic(resume, job.title)
    : { score: 0, titleBoost: false }
  const senSemanticSignal = senSemResult.score > 0 ? senSemResult.score : null
  const seniority = fuseAxis(senKeywordSignal, senSemanticSignal, WEIGHTS.seniority)

  // Apply title boost
  if (senSemResult.titleBoost && seniority.score !== -1) {
    seniority.score = Math.min(100, seniority.score + 10)
  }

  // ─── Tech Stack Axis ──────────────────────────────────────────────────
  const techKeyword = resume.skills.length > 0 ? computeTechStackKeyword(resume.skills, jobText) : null
  const techSemantic = resume.skills.length > 0 ? await computeTechStackSemantic(resume.skills, jobText) : null
  const techStack = fuseAxis(techKeyword, techSemantic, WEIGHTS.techStack)

  // ─── Build Breakdown ──────────────────────────────────────────────────
  const matchBreakdown: MatchBreakdown = { skills, experience, seniority, techStack }

  // Fill zero-evidence axes with mean of others
  fillZeroEvidenceAxes(matchBreakdown)

  // ─── Weighted Average ─────────────────────────────────────────────────
  const matchScore = Math.round(
    matchBreakdown.skills.score * WEIGHTS.skills +
    matchBreakdown.experience.score * WEIGHTS.experience +
    matchBreakdown.seniority.score * WEIGHTS.seniority +
    matchBreakdown.techStack.score * WEIGHTS.techStack,
  )

  return { matchScore, matchBreakdown }
}
