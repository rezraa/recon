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
  benefits: string[]
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
      benefits: Array.isArray(p.benefits) ? p.benefits.map(String).filter((s: string) => s.length > 0) : [],
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

{"title":"<most representative job title>","domain":"<primary professional field>","seniorityLevel":"<intern|junior|mid|senior|staff|principal|director|vp>","yearsExperience":${totalYears},"hardSkills":["<specific tool, language, framework, platform>",...],"softSkills":["<leadership, communication, etc>",...],"certifications":["<any certs mentioned>" or empty],"benefits":[]}`

  const context = await llm.createContext()
  try {
    const session = llm.createSession(context)
    const response = await session.prompt(prompt, { maxTokens: 300, temperature: 0.7 })
    const profile = parseExtraction(response)

    if (!profile) {
      throw new Error('Failed to parse resume extraction from LLM response')
    }

    return profile
  } finally {
    await llm.disposeContext(context)
  }
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

  // Use full description (not stripped) so LLM can see benefits sections
  const cleaned = jobDesc.slice(0, 1200)

  const prompt = `Extract structured data from this job posting. Respond with ONLY a JSON object.

Title: ${jobTitle}
Description: ${cleaned}

{"title":"<exact job title>","domain":"<primary professional field this role belongs to>","seniorityLevel":"<intern|junior|mid|senior|staff|principal|director|vp>","yearsExperience":<years required or 0 if not stated>,"hardSkills":["<specific tool, language, framework, platform>",...],"softSkills":["<leadership, communication, etc>",...],"certifications":["<required certs>" or empty],"benefits":["<health insurance, 401k, PTO, remote work, equity, etc>" or empty]}`

  const context = await llm.createContext()
  try {
    const session = llm.createSession(context)
    const response = await session.prompt(prompt, { maxTokens: 350, temperature: 0.7 })
    const profile = parseExtraction(response)

    if (!profile) {
      throw new Error('Failed to parse job extraction from LLM response')
    }

    return profile
  } finally {
    await llm.disposeContext(context)
  }
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
    // Fallback: embed full resume JSON vs full normalized job description
    const resumeJsonText = JSON.stringify(resumeProfile)
    const resumeFullEmb = await computeEmbedding(resumeJsonText)

    const jobNormText = jobProfile
      ? JSON.stringify(jobProfile)
      : `${job.title}. ${stripBoilerplate(job.descriptionText).slice(0, 500)}`
    const jobFallbackEmb = await computeEmbedding(jobNormText)
    const fallbackSim = Math.max(0, cosineSimilarity(resumeFullEmb, jobFallbackEmb))

    rawSims = { skills: fallbackSim, experience: fallbackSim }
    const result = computeFinalScore(fallbackSim, fallbackSim, fallbackSim, salaryResult.score)

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
