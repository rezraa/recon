import { computeEmbedding, cosineSimilarity } from '@/lib/ai/embeddings'
import { getLLMModel, isModelAvailable } from '@/lib/ai/llm'

import type { MatchBreakdown, NormalizedJob } from './types'

// ─── Axis Weights ─────────────────────────────────────────────────────────

export const WEIGHTS = {
  skills: 0.40,
  experience: 0.30,
  salary: 0.30,
} as const

// ─── Salary Boost ─────────────────────────────────────────────────────────

/** 15% bonus multiplier when salary is in range */
const SALARY_IN_RANGE_BOOST = 1.15

// ─── Profile Extraction Types ─────────────────────────────────────────────

export interface ProfileExtraction {
  title: string
  domain: string
  seniorityLevel: string
  yearsExperience: number
  hardSkills: string[]
  softSkills: string[]
  certifications: string[]
}

export interface EmbeddedProfile {
  hardSkills: Float32Array
  title: Float32Array
}

// ─── Description Sanitizer ───────────────────────────────────────────────

/**
 * Strip known boilerplate from job descriptions so scoring sees actual requirements.
 */
export function stripBoilerplate(text: string): string {
  // Match section headers — these typically start a line or follow a period/colon
  // Ordered by specificity: most specific first, broadest last
  const sectionPatterns = [
    /(?:what you'?ll do|what you'?ll bring|what you'?ll need|what we'?re looking for)/i,
    /(?:key responsibilities|responsibilities|requirements|qualifications)/i,
    /(?:about the role|about this (?:role|job|position|opportunity)|(?:role|position|job) (?:overview|description|summary))/i,
    /(?:an overview of this role|the opportunity|your role|the role)/i,
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

// ─── Scale Function ──────────────────────────────────────────────────────

/**
 * Linear scale from [floor, ceil] → [0, 100], clamped.
 */
export function scaleScore(sim: number, floor = 0.25, ceil = 0.75): number {
  return Math.round(Math.max(0, Math.min(1, (sim - floor) / (ceil - floor))) * 100)
}

// ─── Extraction Parsing ──────────────────────────────────────────────────

/**
 * Parse a JSON profile extraction from raw LLM output.
 * Tolerant of surrounding text — extracts the first JSON object.
 */
export function parseExtraction(raw: string): ProfileExtraction | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const p = JSON.parse(jsonMatch[0])
    return {
      title: String(p.title ?? ''),
      domain: String(p.domain ?? ''),
      seniorityLevel: String(p.seniorityLevel ?? ''),
      yearsExperience: Math.max(0, Number(p.yearsExperience) || 0),
      hardSkills: Array.isArray(p.hardSkills) ? p.hardSkills.map(String).filter((s: string) => s.length > 0) : [],
      softSkills: Array.isArray(p.softSkills) ? p.softSkills.map(String).filter((s: string) => s.length > 0) : [],
      certifications: Array.isArray(p.certifications) ? p.certifications.map(String).filter((s: string) => s.length > 0) : [],
    }
  } catch {
    return null
  }
}

// ─── Resume Extraction ──────────────────────────────────────────────────

/**
 * Extract a structured profile from resume data using the LLM.
 * Called once on upload or first scoring run, result is cached in DB.
 */
export async function extractResumeProfile(
  skills: string[],
  experience: Array<{ title: string; company: string; years: number | null }>,
): Promise<ProfileExtraction> {
  if (!isModelAvailable()) {
    throw new Error(
      'LLM model not found. Run `./run.sh` to download the Qwen 3.5 2B model, or set LLM_MODEL_PATH.',
    )
  }

  const llm = await getLLMModel()
  if (!llm) {
    throw new Error('Failed to load LLM model.')
  }

  const expText = experience
    .map(e => `${e.title} at ${e.company}${e.years ? ` (${e.years} years)` : ''}`)
    .join('. ')
  const totalYears = experience.reduce((sum, e) => sum + (e.years ?? 0), 0)

  const prompt = `Extract a structured profile from this resume. Respond with ONLY a JSON object.

Skills: ${skills.join(', ')}
Experience: ${expText}
Total years: ${totalYears}

{"title":"<most representative job title>","domain":"<primary professional field>","seniorityLevel":"<intern|junior|mid|senior|staff|principal|director|vp>","yearsExperience":${totalYears},"hardSkills":["<specific tool, language, framework, platform>",...],"softSkills":["<leadership, communication, etc>",...],"certifications":["<any certs mentioned>" or empty]}`

  const MAX_RETRIES = 3
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const context = await llm.createContext()
    try {
      const session = llm.createSession(context)
      const response = await session.prompt(prompt, { maxTokens: 300, temperature: 0.1, topP: 0.9 })
      const profile = parseExtraction(response)

      if (profile && profile.hardSkills.length > 0) {
        return profile
      }

      // Log the bad response and retry
      console.error(`[resume-extract] attempt ${attempt}/${MAX_RETRIES} failed to parse. Raw: ${response.slice(0, 300)}`)
    } finally {
      await llm.disposeContext(context)
    }
  }

  throw new Error(`Failed to parse resume extraction after ${MAX_RETRIES} attempts`)
}

// ─── Job Extraction ─────────────────────────────────────────────────────

/**
 * Extract a structured profile from a job posting using the LLM.
 * Called once per job during the pipeline, result is cached in DB.
 */
export async function extractJobProfile(jobTitle: string, jobDesc: string): Promise<ProfileExtraction> {
  if (!isModelAvailable()) {
    throw new Error(
      'LLM model not found. Run `./run.sh` to download the Qwen 3.5 2B model, or set LLM_MODEL_PATH.',
    )
  }

  const llm = await getLLMModel()
  if (!llm) {
    throw new Error('Failed to load LLM model.')
  }

  const cleaned = stripBoilerplate(jobDesc).slice(0, 1200)

  const prompt = `Extract structured data from this job posting. Respond with ONLY a JSON object.

Title: ${jobTitle}
Description: ${cleaned}

{"title":"<exact job title>","domain":"<primary professional field this role belongs to>","seniorityLevel":"<intern|junior|mid|senior|staff|principal|director|vp>","yearsExperience":<years required or 0 if not stated>,"hardSkills":["<specific tool, language, framework, platform>",...],"softSkills":["<leadership, communication, etc>",...],"certifications":["<required certs>" or empty]}`

  const MAX_RETRIES = 2
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const context = await llm.createContext()
    try {
      const session = llm.createSession(context)
      const response = await session.prompt(prompt, { maxTokens: 250, temperature: 0.1, topP: 0.9 })
      const profile = parseExtraction(response)

      if (profile) {
        return profile
      }

      console.error(`[job-extract] attempt ${attempt}/${MAX_RETRIES} failed for "${jobTitle}". Raw: ${response.slice(0, 200)}`)
    } finally {
      await llm.disposeContext(context)
    }
  }

  throw new Error(`Failed to parse job extraction for "${jobTitle}" after ${MAX_RETRIES} attempts`)
}

// ─── Profile Embedding ──────────────────────────────────────────────────

/**
 * Embed a profile's hardSkills and title+seniority for similarity comparison.
 */
export async function embedProfile(profile: ProfileExtraction): Promise<EmbeddedProfile> {
  const [hardSkills, title] = await Promise.all([
    computeEmbedding(profile.hardSkills.length > 0 ? profile.hardSkills.join(', ') : 'none'),
    computeEmbedding(`${profile.seniorityLevel} ${profile.title}`),
  ])
  return { hardSkills, title }
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
    return { score: 100, label: 'in range' }
  }

  if (userTarget < effectiveMin) {
    const gap = (effectiveMin - userTarget) / effectiveMin
    const score = Math.max(0, Math.round((1 - gap * 2) * 100))
    return { score, label: 'target below' }
  }

  const gap = (userTarget - effectiveMax) / userTarget
  const score = Math.max(0, Math.round((1 - gap * 2) * 100))
  return { score, label: 'target above' }
}

// ─── Final Score Computation ─────────────────────────────────────────────

function computeFinalScore(
  skillsSim: number,
  experienceSim: number,
  domainSim: number,
  salaryScore: number,
): { score: number; skills: number; experience: number; domain: number } {
  const skills = scaleScore(skillsSim)
  const experience = scaleScore(experienceSim)
  const domain = scaleScore(domainSim, 0.3, 0.85) // tight range — aggressive gating

  // Domain is a multiplier (0-100% → 0.0-1.0), not an axis
  const domainMultiplier = domain / 100

  const raw = skills * WEIGHTS.skills + experience * WEIGHTS.experience + salaryScore * WEIGHTS.salary
  const boosted = salaryScore === 100 ? raw * SALARY_IN_RANGE_BOOST : raw
  const gated = boosted * domainMultiplier

  return {
    score: Math.min(100, Math.round(gated)),
    skills,
    experience,
    domain,
  }
}

// ─── Build Breakdown ─────────────────────────────────────────────────────

function buildBreakdown(
  skills: number,
  experience: number,
  salary: number,
  domain: number,
  rawSims: { skills: number; experience: number },
): MatchBreakdown {
  return {
    skills: {
      score: skills,
      weight: WEIGHTS.skills,
      signals: { keyword: null, semantic: rawSims.skills },
    },
    experience: {
      score: experience,
      weight: WEIGHTS.experience,
      signals: { keyword: null, semantic: rawSims.experience },
    },
    salary: {
      score: salary,
      weight: WEIGHTS.salary,
      signals: { keyword: null, semantic: null },
    },
    domainMultiplier: domain,
  }
}

// ─── Main Scoring Function ──────────────────────────────────────────────

/**
 * Score a job using symmetric extraction + embedding approach:
 * 1. Extract structured JSON from job (or use cached profile)
 * 2. Embed hardSkills and title+seniority for both resume and job
 * 3. Cosine similarity → scaled scores for skills and experience axes
 * 4. hardSkills similarity doubles as domain multiplier (gate)
 * 5. Salary axis is pure math
 * 6. Final = (weighted sum) × domainMultiplier, with salary-in-range boost
 *
 * LLM model is required for extraction — throws if unavailable.
 *
 * @param cachedJobProfile - Pre-extracted job profile (cached from DB). If not provided, will be extracted via LLM.
 */
export async function scoreJob(
  job: NormalizedJob,
  resumeProfile: ProfileExtraction,
  resumeEmbeddings: EmbeddedProfile,
  userSalaryTarget?: number | null,
  cachedJobProfile?: ProfileExtraction | null,
): Promise<{ matchScore: number; matchBreakdown: MatchBreakdown; extractedProfile?: ProfileExtraction }> {
  // Detect title-only jobs (from external search) — use partial scoring path
  if (isTitleOnly(job.title, job.descriptionText)) {
    const partial = await scorePartialJob(job.title, resumeEmbeddings)
    return { ...partial }
  }

  const salaryResult = computeSalary(userSalaryTarget ?? null, job.salaryMin, job.salaryMax)

  // Extract or use cached job profile
  let jobProfile: ProfileExtraction | null = cachedJobProfile ?? null
  let newlyExtracted = false

  if (!jobProfile) {
    try {
      jobProfile = await extractJobProfile(job.title, job.descriptionText)
      newlyExtracted = true
    } catch {
      jobProfile = null
    }
  }

  let matchScore: number
  let skills: number
  let experience: number
  let domain: number
  let rawSims = { skills: 0, experience: 0 }

  if (jobProfile && jobProfile.hardSkills.length > 0) {
    // Normal path: embed extracted fields and compare
    const jobEmb = await embedProfile(jobProfile)

    // hardSkills similarity = both skills axis AND domain multiplier
    const skillsSim = Math.max(0, cosineSimilarity(resumeEmbeddings.hardSkills, jobEmb.hardSkills))
    const expSim = Math.max(0, cosineSimilarity(resumeEmbeddings.title, jobEmb.title))

    rawSims = { skills: skillsSim, experience: expSim }
    const result = computeFinalScore(skillsSim, expSim, skillsSim, salaryResult.score)

    matchScore = result.score
    skills = result.skills
    experience = result.experience
    domain = result.domain
  } else {
    // Fallback: extraction failed or produced 0 hardSkills.
    // Use title embedding for experience axis (same as partial scoring)
    // but give skills=0 since we have no reliable skill data.
    // This intentionally produces conservative scores.
    const titleEmb = await computeEmbedding(`${jobProfile?.seniorityLevel ?? ''} ${job.title}`)
    const expSim = Math.max(0, cosineSimilarity(resumeEmbeddings.title, titleEmb))

    rawSims = { skills: 0, experience: expSim }
    const result = computeFinalScore(0, expSim, 0, salaryResult.score)

    matchScore = result.score
    skills = result.skills
    experience = result.experience
    domain = result.domain
  }

  const matchBreakdown = buildBreakdown(skills, experience, salaryResult.score, domain, rawSims)

  return {
    matchScore,
    matchBreakdown,
    ...(newlyExtracted && jobProfile ? { extractedProfile: jobProfile } : {}),
  }
}

/**
 * Check if a job is title-only (no meaningful description).
 * Returns true when description_text is missing, empty, or just the title.
 */
export function isTitleOnly(title: string, descriptionText: string): boolean {
  const desc = descriptionText.trim()
  if (!desc) return true
  if (desc === title.trim()) return true
  // Very short descriptions (< 50 chars) that are effectively just the title
  if (desc.length < 50 && desc.toLowerCase().includes(title.trim().toLowerCase())) return true
  return false
}

/**
 * Partial scoring for title-only jobs (from external search).
 * - Experience axis: embed title vs resume title embedding
 * - Skills axis: 0 (no description to extract from)
 * - Salary: 0 (no salary data)
 * - No LLM call needed
 */
export async function scorePartialJob(
  jobTitle: string,
  resumeEmbeddings: EmbeddedProfile,
): Promise<{ matchScore: number; matchBreakdown: MatchBreakdown }> {
  const titleEmb = await computeEmbedding(jobTitle)
  const expSim = Math.max(0, cosineSimilarity(resumeEmbeddings.title, titleEmb))
  const experience = scaleScore(expSim)

  // Skills=0, salary=0. Domain gate: title similarity is the best proxy available
  // for title-only jobs (no description to extract domain from). This intentionally
  // produces conservative scores — unrelated titles get gated to near-zero.
  const domainMultiplier = scaleScore(expSim, 0.3, 0.85) / 100
  const raw = 0 * WEIGHTS.skills + experience * WEIGHTS.experience + 0 * WEIGHTS.salary
  const matchScore = Math.min(100, Math.round(raw * domainMultiplier))

  const matchBreakdown = buildBreakdown(0, experience, 0, Math.round(domainMultiplier * 100), {
    skills: 0,
    experience: expSim,
  })

  return { matchScore, matchBreakdown }
}
