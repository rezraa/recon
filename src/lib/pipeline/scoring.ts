import { computeEmbedding, cosineSimilarity } from '@/lib/ai/embeddings'
import { getLLMModel, isModelAvailable } from '@/lib/ai/llm'

import type { ParsedResume } from './resumeTypes'
import type { MatchBreakdown, NormalizedJob } from './types'

// ─── Axis Weights ─────────────────────────────────────────────────────────

export const WEIGHTS = {
  skills: 0.35,
  techStack: 0.25,
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

// ─── Tech Stack Axis (Job's tech terms covered by resume) ────────────────

// Curated set of real tech terms. Excludes ambiguous short terms
// (r, go, ci, cd, less, gin, rest) that match common English words.
const KNOWN_TECH = new Set([
  // Languages
  'javascript', 'typescript', 'python', 'java', 'kotlin', 'golang', 'ruby', 'rust',
  'swift', 'c#', 'c++', 'php', 'scala', 'elixir', 'clojure', 'haskell', 'dart', 'lua',
  // Frontend
  'react', 'angular', 'vue', 'svelte', 'next.js', 'nextjs', 'nuxt', 'gatsby', 'remix',
  'tailwind', 'webpack', 'vite', 'esbuild',
  // Backend
  'node.js', 'nodejs', 'express', 'fastify', 'django', 'flask', 'rails', 'spring boot',
  'nest.js', 'nestjs', 'graphql', 'grpc', 'nats',
  // Data
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb',
  'cassandra', 'sqlite', 'nosql', 'snowflake', 'bigquery', 'redshift',
  // Cloud/Infra
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible',
  'cloudformation', 'pulumi', 'helm', 'istio', 'nginx', 'apache', 'linux',
  // CI/CD & Tools
  'jenkins', 'github actions', 'gitlab', 'circleci', 'ci/cd',
  'github', 'bitbucket', 'jira', 'confluence',
  // Testing
  'selenium', 'playwright', 'cypress', 'jest', 'vitest', 'mocha', 'pytest',
  'appium', 'postman', 'k6', 'locust', 'gatling',
  // ML/AI
  'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy', 'spark', 'airflow',
  'kafka', 'rabbitmq', 'celery', 'openai', 'langchain',
  // Other
  'figma', 'storybook', 'datadog', 'splunk', 'grafana', 'prometheus', 'new relic',
  'sentry', 'pagerduty', 'vercel', 'netlify', 'heroku',
  'bullmq', 'sidekiq', 'ecs', 'fargate', 'lambda', 'rds',
  'cloudwatch', 'sns', 'sqs', 'kinesis',
])

export interface TechResult {
  score: number
  covered: string[]
  jobTerms: string[]
}

export function computeTechStack(resumeSkills: string[], jobText: string): TechResult {
  const jobLower = jobText.toLowerCase()

  const jobTerms: string[] = []
  for (const term of KNOWN_TECH) {
    if (/[^a-z\s]/.test(term)) {
      if (jobLower.includes(term)) jobTerms.push(term)
    } else {
      const regex = new RegExp(`\\b${term}\\b`, 'i')
      if (regex.test(jobText)) jobTerms.push(term)
    }
  }

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
    if (resumeWords.has(term)) return true
    return resumeLower.some(skill => skill.includes(term) || term.includes(skill))
  })

  // Minimum effective denominator prevents small-denominator inflation.
  // A job with 1 tech term and 1 match should NOT score 100% —
  // real software jobs have 4+ tech terms. This caps 1/1 at 25%.
  const MIN_TECH_TERMS = 4
  const effectiveDenom = Math.max(jobTerms.length, MIN_TECH_TERMS)

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
  techStack: number
  experience: number
  salary: number
}

function computeWeightedScore(axes: Axes): number {
  const raw =
    axes.skills * WEIGHTS.skills +
    axes.techStack * WEIGHTS.techStack +
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
  const t = Math.round(mathAxes.techStack / 10)
  const e = Math.round(mathAxes.experience / 10)

  return `A scoring system rated this candidate-job match. Review and adjust each score. Output ONLY 3 lines, no other text.

Initial scores — Skills: ${s}/10, Tech: ${t}/10, Experience: ${e}/10

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
  const techMatch = full.match(/Tech(?:\s*Stack)?:\s*(\d{1,2})/i)
  const expMatch = full.match(/Experience:\s*(\d{1,2})/i)

  if (!skillsMatch) return null

  const s = Math.min(10, parseInt(skillsMatch[1], 10)) * 10
  const t = techMatch ? Math.min(10, parseInt(techMatch[1], 10)) * 10 : mathAxes.techStack
  const e = expMatch ? Math.min(10, parseInt(expMatch[1], 10)) * 10 : mathAxes.experience

  return {
    skills: clampNudge(s, mathAxes.skills),
    techStack: clampNudge(t, mathAxes.techStack),
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
    techStack: {
      score: axes.techStack,
      weight: WEIGHTS.techStack,
      signals: { keyword: axes.techStack / 100, semantic: null },
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
 * 1. Math scoring: keyword overlap (skills, tech), embedding similarity (experience), salary fit
 * 2. Tier assignment: <15 REJECT (skip LLM), 15-45 UNLIKELY (cap 50), 45+ POSSIBLE
 * 3. LLM nudge: bounded ±10 per axis, zero-lock on zero-evidence axes
 * 4. Salary-in-range boost: 1.15x when salary is a perfect match
 *
 * LLM model is required — throws if unavailable.
 */
export async function scoreJob(
  job: NormalizedJob,
  resume: ParsedResume,
  userSalaryTarget?: number | null,
): Promise<{ matchScore: number; matchBreakdown: MatchBreakdown }> {
  const cleanDesc = stripBoilerplate(job.descriptionText)
  const fullText = `${job.title} ${cleanDesc}`

  // Step 1: Math scoring
  const skillsResult = computeSkills(resume.skills, fullText)
  const techResult = computeTechStack(resume.skills, fullText)
  const expScore = await computeExperience(resume, fullText)
  const salaryResult = computeSalary(userSalaryTarget ?? null, job.salaryMin, job.salaryMax)

  let axes: Axes = {
    skills: skillsResult.score,
    techStack: techResult.score,
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
          techStack: Math.round(axes.techStack * scale),
          experience: Math.round(axes.experience * scale),
          salary: Math.round(axes.salary * scale),
        }
      }
    }
  }

  const matchBreakdown = buildBreakdown(axes)
  const matchScore = computeWeightedScore(axes)

  return { matchScore, matchBreakdown }
}
