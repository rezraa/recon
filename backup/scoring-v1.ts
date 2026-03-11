import { computeEmbedding, cosineSimilarity } from '@/lib/ai/embeddings'
import { getLLMModel, isModelAvailable } from '@/lib/ai/llm'

import type { ParsedResume } from './resumeTypes'
import type { MatchBreakdown, NormalizedJob } from './types'

// ─── Axis Weights ─────────────────────────────────────────────────────────

export const WEIGHTS = {
  skills: 0.35,
  requirements: 0.25,
  experience: 0.20,
  salary: 0.20,
} as const

// ─── Salary Boost ─────────────────────────────────────────────────────────

/** 15% bonus multiplier when salary is in range */
const SALARY_IN_RANGE_BOOST = 1.15

// ─── Hybrid Tiers ─────────────────────────────────────────────────────────

const TIER_REJECT = 15
const TIER_UNLIKELY = 45

// ─── Description Sanitizer ───────────────────────────────────────────────

/**
 * Strip known boilerplate from job descriptions so scoring sees actual requirements.
 */
export function stripBoilerplate(text: string): string {
  const sectionPatterns = [
    /(?:what you'?ll do|responsibilities|key responsibilities)/i,
    /(?:requirements|qualifications|what we'?re looking for|what you'?ll need|you have)/i,
    /(?:about the role|the role|your role)/i,
  ]

  for (const pattern of sectionPatterns) {
    const idx = text.search(pattern)
    if (idx !== -1 && idx < text.length * 0.7) {
      return text.slice(idx).trim()
    }
  }

  const sentences = text.split(/(?<=[.!?])\s+|(?<=:)\s+(?=[A-Z])/)
  const junkPatterns = [
    /^about us\b/i, /^about the company\b/i, /^who we are\b/i, /^our mission is/i,
    /equal opportunity employer/i, /we do not discriminate/i, /^are you looking for/i,
    /^do you love the challenge/i, /^if you'?re passionate about/i, /we'?d love to meet you/i,
  ]

  return sentences
    .filter(s => s.trim() && !junkPatterns.some(p => p.test(s.trim())))
    .join(' ')
    .trim()
}

// ─── Skills Axis (Keyword Overlap) ───────────────────────────────────────

export interface SkillsResult {
  score: number
  matched: string[]
  total: number
}

/**
 * Tokenize multi-word skills and check if significant words appear in job text.
 * "CI/CD Pipeline Design" matches if "ci/cd" AND "pipeline" appear.
 * Single-word skills do exact word boundary matching.
 */
export function computeSkills(resumeSkills: string[], jobText: string): SkillsResult {
  if (resumeSkills.length === 0) return { score: 0, matched: [], total: 0 }
  const jobLower = jobText.toLowerCase()
  const matched: string[] = []

  for (const skill of resumeSkills) {
    const words = skill.toLowerCase().split(/[\s&,]+/).filter(w => w.length >= 2)
    if (words.length === 0) continue

    if (words.length === 1) {
      const word = words[0]
      // For skills with special chars (C++, C#, CI/CD), use case-insensitive includes
      if (/[^a-z0-9]/.test(word)) {
        if (jobLower.includes(word)) {
          matched.push(skill)
        }
      } else {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(jobText)) {
          matched.push(skill)
        }
      }
      continue
    }

    const fillers = new Set(['and', 'the', 'for', 'with', 'in', 'of', 'to', 'a', 'an'])
    const significant = words.filter(w => !fillers.has(w))
    if (significant.length === 0) continue

    const threshold = Math.ceil(significant.length * 0.6)
    const wordHits = significant.filter(w => jobLower.includes(w))
    if (wordHits.length >= threshold) {
      matched.push(skill)
    }
  }

  return {
    score: Math.round((matched.length / resumeSkills.length) * 100),
    matched,
    total: resumeSkills.length,
  }
}

// ─── Requirements Axis (LLM-extracted job requirements covered by resume) ─

export interface RequirementsResult {
  score: number
  covered: string[]
  jobTerms: string[]
}

/**
 * Extract skills/qualifications from a job description using the Qwen LLM.
 * Returns a list of specific requirements (e.g., ["TypeScript", "AWS", "5+ years experience"]).
 * Throws if LLM is unavailable.
 */
export async function extractJobRequirements(jobText: string): Promise<string[]> {
  if (!isModelAvailable()) {
    throw new Error(
      'LLM model not found. Run `./run.sh` to download the Qwen 3.5 2B model, or set LLM_MODEL_PATH.',
    )
  }

  const llm = await getLLMModel()
  if (!llm) {
    throw new Error('Failed to load LLM model.')
  }

  const prompt = `List the specific skills, tools, technologies, certifications, and qualifications required in this job description. Output ONLY a comma-separated list.\n\n${stripBoilerplate(jobText).slice(0, 800)}`

  const context = await llm.createContext()
  try {
    const session = llm.createSession(context)
    const response = await session.prompt(prompt, { maxTokens: 100, temperature: 0 })

    // Parse comma-separated response into array
    const terms = response
      .split(',')
      .map(t => t.trim().replace(/^[-•*\d.)\s]+/, '').trim()) // strip bullet/number prefixes
      .filter(t => t.length > 1 && t.length < 60 && !/^\d+$/.test(t)) // reject empty, too long, or bare numbers

    // If LLM returned fewer than 2 terms, the response was likely malformed
    if (terms.length < 2) {
      console.warn('[extractJobRequirements] LLM returned fewer than 2 terms, returning empty')
      return []
    }

    return terms
  } finally {
    await llm.disposeContext(context)
  }
}

/**
 * Compute what percentage of the job's requirements are covered by the resume.
 * Same coverage math as the old computeTechStack but with dynamic LLM-extracted terms.
 */
export function computeRequirements(resumeSkills: string[], jobTerms: string[]): RequirementsResult {
  if (jobTerms.length === 0 || resumeSkills.length === 0) {
    return { score: 0, covered: [], jobTerms }
  }

  const resumeLower = resumeSkills.map(s => s.toLowerCase())
  const resumeWords = new Set<string>()
  for (const skill of resumeLower) {
    resumeWords.add(skill)
    for (const word of skill.split(/[\s/&,]+/)) {
      if (word.length >= 2) resumeWords.add(word)
    }
  }

  const covered = jobTerms.filter(term => {
    const termLower = term.toLowerCase()
    if (resumeWords.has(termLower)) return true
    // Substring matching — only for terms ≥ 3 chars to avoid false positives (e.g., "AI" matching "maintain")
    if (termLower.length < 3) return false
    return resumeLower.some(skill =>
      skill.length >= 3 && (skill.includes(termLower) || termLower.includes(skill)),
    )
  })

  // Minimum effective denominator prevents small-denominator inflation.
  const MIN_TERMS = 4
  const effectiveDenom = Math.max(jobTerms.length, MIN_TERMS)

  return {
    score: Math.round((covered.length / effectiveDenom) * 100),
    covered,
    jobTerms,
  }
}

// ─── Experience Axis (Embedding Similarity) ──────────────────────────────

export async function computeExperience(resume: ParsedResume, jobText: string): Promise<number> {
  if (resume.experience.length === 0) return 0
  const resumeExpText = resume.experience
    .map((e) => `${e.title} at ${e.company}${e.years ? ` for ${e.years} years` : ''}`)
    .join('. ')
  const [resumeEmb, jobEmb] = await Promise.all([
    computeEmbedding(resumeExpText),
    computeEmbedding(jobText.slice(0, 1000)),
  ])
  const sim = Math.max(0, cosineSimilarity(resumeEmb, jobEmb))
  // Scale: below 0.2 = 0, above 0.6 = 100, linear between
  return Math.max(0, Math.min(100, Math.round(((sim - 0.2) / 0.4) * 100)))
}

// ─── Salary Axis ─────────────────────────────────────────────────────────

/**
 * Score how well the user's target salary fits the job's posted range.
 * - Target within range → 100 (triggers boost multiplier)
 * - Target slightly outside → scales down
 * - No salary data → 50 (neutral)
 */
export function computeSalary(
  userTarget: number | null,
  jobMin: number | null | undefined,
  jobMax: number | null | undefined,
): { score: number; label: string } {
  if (!userTarget) return { score: 50, label: 'no target' }

  // Treat 0 as unset
  const min = (jobMin && jobMin > 0) ? jobMin : null
  const max = (jobMax && jobMax > 0) ? jobMax : null

  if (min === null && max === null) return { score: 50, label: 'not posted' }

  const effectiveMin = min ?? max!
  const effectiveMax = max ?? min!

  if (userTarget >= effectiveMin && userTarget <= effectiveMax) {
    return { score: 100, label: `in range` }
  }

  if (userTarget < effectiveMin) {
    const gap = (effectiveMin - userTarget) / effectiveMin
    const score = Math.max(0, Math.round((1 - gap * 2) * 100))
    return { score, label: `target below` }
  }

  const gap = (userTarget - effectiveMax) / userTarget
  const score = Math.max(0, Math.round((1 - gap * 2) * 100))
  return { score, label: `target above` }
}

// ─── Weighted Score ──────────────────────────────────────────────────────

export interface Axes {
  skills: number
  requirements: number
  experience: number
  salary: number
}

function computeWeightedScore(axes: Axes): number {
  const raw =
    axes.skills * WEIGHTS.skills +
    axes.requirements * WEIGHTS.requirements +
    axes.experience * WEIGHTS.experience +
    axes.salary * WEIGHTS.salary

  const boosted = axes.salary === 100 ? raw * SALARY_IN_RANGE_BOOST : raw
  return Math.min(100, Math.round(boosted))
}

// ─── LLM Prompt (for hybrid mode) ───────────────────────────────────────

function buildResumeText(resume: ParsedResume): string {
  return [
    `Skills: ${resume.skills.join(', ')}`,
    ...resume.experience.map(
      (e) => `${e.title} at ${e.company}${e.years ? ` (${e.years} years)` : ''}`,
    ),
  ].join('. ')
}

/**
 * Hybrid nudge prompt: gives LLM the initial math scores and asks it to
 * adjust by at most ±2 on a 0-10 scale. Only 3 axes — salary is math-only.
 */
export function buildNudgePrompt(
  resumeText: string,
  jobTitle: string,
  jobDesc: string,
  mathAxes: Axes,
): string {
  const s = Math.round(mathAxes.skills / 10)
  const t = Math.round(mathAxes.requirements / 10)
  const e = Math.round(mathAxes.experience / 10)

  return `A scoring system rated this candidate-job match. Review and adjust each score. Output ONLY 3 lines, no other text.

Initial scores — Skills: ${s}/10, Requirements: ${t}/10, Experience: ${e}/10

Candidate: ${resumeText.slice(0, 300)}
Job: ${jobTitle} - ${stripBoilerplate(jobDesc).slice(0, 500)}

Adjusted scores (each 0-10, adjust by at most ±2 from initial):
Skills:`
}

// ─── Nudge Response Parser ───────────────────────────────────────────────

/**
 * Parse the LLM nudge response (3 axes on 0-10 scale).
 * Applies clampNudge inline: ±10 on 0-100, zero-lock on zero-evidence axes.
 * Returns null if unparseable; falls back to math axes for missing lines.
 */
export function parseNudgeResponse(response: string, mathAxes: Axes): Axes | null {
  const full = response.startsWith('Skills') ? response : 'Skills: ' + response
  const skillsMatch = full.match(/Skills:\s*(\d{1,2})/i)
  const reqMatch = full.match(/Requirements?:\s*(\d{1,2})/i) ?? full.match(/Tech(?:\s*Stack)?:\s*(\d{1,2})/i)
  const expMatch = full.match(/Experience:\s*(\d{1,2})/i)

  if (!skillsMatch) return null

  const s = Math.min(10, parseInt(skillsMatch[1], 10)) * 10
  const t = reqMatch ? Math.min(10, parseInt(reqMatch[1], 10)) * 10 : mathAxes.requirements
  const e = expMatch ? Math.min(10, parseInt(expMatch[1], 10)) * 10 : mathAxes.experience

  return {
    skills: clampNudge(s, mathAxes.skills),
    requirements: clampNudge(t, mathAxes.requirements),
    experience: clampNudge(e, mathAxes.experience),
    salary: mathAxes.salary, // LLM doesn't touch salary — it's objective
  }
}

// ─── LLM Hybrid Nudge ───────────────────────────────────────────────────

/**
 * Clamp LLM nudge to ±10 points per axis. If math says 0 (zero evidence),
 * LLM cannot override — prevents hallucinated scores.
 */
function clampNudge(llmScore: number, mathScore: number): number {
  if (mathScore === 0) return 0  // zero-lock
  const delta = Math.max(-10, Math.min(10, llmScore - mathScore))
  return Math.max(0, Math.min(100, mathScore + delta))
}

async function applyLLMNudge(
  axes: Axes,
  resume: ParsedResume,
  job: NormalizedJob,
): Promise<Axes> {
  if (!isModelAvailable()) {
    throw new Error(
      'LLM model not found. Run `./run.sh` to download the Qwen 3.5 2B model, or set LLM_MODEL_PATH.',
    )
  }

  const llm = await getLLMModel()
  if (!llm) {
    throw new Error('Failed to load LLM model.')
  }

  const resumeText = buildResumeText(resume)
  const prompt = buildNudgePrompt(resumeText, job.title, job.descriptionText, axes)

  const context = await llm.createContext()
  try {
    const session = llm.createSession(context)
    const response = await session.prompt(prompt, { maxTokens: 20, temperature: 0 })
    const nudged = parseNudgeResponse(response, axes)

    if (!nudged) return axes // unparseable LLM response — keep math scores

    return nudged
  } finally {
    await llm.disposeContext(context)
  }
}

// ─── Build Breakdown ─────────────────────────────────────────────────────

function buildBreakdown(axes: Axes): MatchBreakdown {
  return {
    skills: {
      score: axes.skills,
      weight: WEIGHTS.skills,
      signals: { keyword: axes.skills / 100, semantic: null },
    },
    requirements: {
      score: axes.requirements,
      weight: WEIGHTS.requirements,
      signals: { keyword: axes.requirements / 100, semantic: null },
    },
    experience: {
      score: axes.experience,
      weight: WEIGHTS.experience,
      signals: { keyword: null, semantic: axes.experience / 100 },
    },
    salary: {
      score: axes.salary,
      weight: WEIGHTS.salary,
      signals: { keyword: null, semantic: null },
    },
  }
}

// ─── Main Scoring Function ──────────────────────────────────────────────

/**
 * Score a job using math-first hybrid approach:
 * 1. Math scoring: keyword overlap (skills), LLM-extracted requirements coverage, embedding similarity (experience), salary fit
 * 2. Tier assignment: <15 REJECT (skip LLM), 15-45 UNLIKELY (cap 50), 45+ POSSIBLE
 * 3. LLM nudge: bounded ±10 per axis, zero-lock on zero-evidence axes
 * 4. Salary-in-range boost: 1.15x when salary is a perfect match
 *
 * LLM model is required — throws if unavailable.
 *
 * @param jobRequirements - Pre-extracted job requirements (cached from DB). If not provided, will be extracted via LLM.
 */
export async function scoreJob(
  job: NormalizedJob,
  resume: ParsedResume,
  userSalaryTarget?: number | null,
  jobRequirements?: string[] | null,
): Promise<{ matchScore: number; matchBreakdown: MatchBreakdown; extractedRequirements?: string[] }> {
  const cleanDesc = stripBoilerplate(job.descriptionText)
  const fullText = `${job.title} ${cleanDesc}`

  // Step 1: Math scoring
  const skillsResult = computeSkills(resume.skills, fullText)

  // Requirements: use cached terms if available, otherwise extract via LLM
  let reqTerms: string[]
  let newlyExtracted = false
  if (jobRequirements && jobRequirements.length > 0) {
    reqTerms = jobRequirements
  } else {
    reqTerms = await extractJobRequirements(job.descriptionText)
    newlyExtracted = true
  }
  const reqResult = computeRequirements(resume.skills, reqTerms)

  const expScore = await computeExperience(resume, fullText)
  const salaryResult = computeSalary(userSalaryTarget ?? null, job.salaryMin, job.salaryMax)

  let axes: Axes = {
    skills: skillsResult.score,
    requirements: reqResult.score,
    experience: expScore,
    salary: salaryResult.score,
  }

  // Step 2: Tier-based LLM nudge
  const mathScore = computeWeightedScore(axes)

  if (mathScore >= TIER_REJECT) {
    // Worth LLM nudging
    axes = await applyLLMNudge(axes, resume, job)

    // Cap UNLIKELY tier at 50
    if (mathScore < TIER_UNLIKELY) {
      const nudgedScore = computeWeightedScore(axes)
      if (nudgedScore > 50) {
        // Scale axes down proportionally to hit cap
        const scale = 50 / nudgedScore
        axes = {
          skills: Math.round(axes.skills * scale),
          requirements: Math.round(axes.requirements * scale),
          experience: Math.round(axes.experience * scale),
          salary: Math.round(axes.salary * scale),
        }
      }
    }
  }

  const matchBreakdown = buildBreakdown(axes)
  const matchScore = computeWeightedScore(axes)

  return {
    matchScore,
    matchBreakdown,
    ...(newlyExtracted ? { extractedRequirements: reqTerms } : {}),
  }
}
