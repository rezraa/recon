import { getLLMModel, isModelAvailable } from '@/lib/ai/llm'

import type { ParsedResume } from './resumeTypes'
import type { MatchBreakdown, NormalizedJob } from './types'

// ─── Axis Weights ─────────────────────────────────────────────────────────

const WEIGHTS = {
  skills: 0.45,
  experience: 0.15,
  seniority: 0.15,
  techStack: 0.25,
} as const

// ─── Prompt ───────────────────────────────────────────────────────────────

export function buildPrompt(resumeText: string, jobTitle: string, jobDesc: string): string {
  return `You are screening resumes. Score how well this candidate matches the job across 4 axes. Consider skill transferability — experience in one technical area can apply to related areas.

Score each axis 0-100:
- Skills: How many of the candidate's skills match the job requirements?
- Experience: Does the candidate's experience level match what the job asks for?
- Seniority: Does the candidate's career level match the job's seniority level?
- TechStack: How well does the candidate's tech stack cover the job's tech needs?

Scoring guide per axis:
5-20: no relevant match (completely different domain)
25-40: few transferable elements
45-60: moderate overlap, would need ramp-up
65-80: strong match, credible candidate
85-95: exceptional fit

Return ONLY 4 lines in this exact format, nothing else:
Skills: <number>
Experience: <number>
Seniority: <number>
TechStack: <number>

Candidate: ${resumeText.slice(0, 300)}
Job: ${jobTitle} - ${jobDesc.slice(0, 400)}

Scores:`
}

// ─── Resume Text Builder ──────────────────────────────────────────────────

function buildResumeText(resume: ParsedResume): string {
  return [
    `Skills: ${resume.skills.join(', ')}`,
    ...resume.experience.map(
      (e) => `${e.title} at ${e.company}${e.years ? ` (${e.years} years)` : ''}`,
    ),
  ].join('. ')
}

// ─── Score Extraction ─────────────────────────────────────────────────────

export interface AxisScores {
  skills: number
  experience: number
  seniority: number
  techStack: number
}

/**
 * Parse the LLM response for per-axis scores.
 * Expected format:
 *   Skills: 75
 *   Experience: 60
 *   Seniority: 80
 *   TechStack: 65
 */
export function extractAxisScores(response: string): AxisScores | null {
  const skillsMatch = response.match(/Skills:\s*(\d{1,3})/i)
  const experienceMatch = response.match(/Experience:\s*(\d{1,3})/i)
  const seniorityMatch = response.match(/Seniority:\s*(\d{1,3})/i)
  const techStackMatch = response.match(/TechStack:\s*(\d{1,3})/i)

  if (!skillsMatch || !experienceMatch || !seniorityMatch || !techStackMatch) {
    // Try fallback: extract a single holistic score (prefer 2-digit numbers to avoid
    // matching noise like "4 axes" or "0-100" in preamble text)
    const twoDigitMatch = response.match(/\b(\d{2,3})\b/)
    if (twoDigitMatch) {
      const n = parseInt(twoDigitMatch[1], 10)
      if (n >= 0 && n <= 100) {
        return { skills: n, experience: n, seniority: n, techStack: n }
      }
    }
    // Last resort: single digit (e.g., "5" for very low scores)
    const singleDigitMatch = response.match(/\b(\d)\b/)
    if (singleDigitMatch) {
      const n = parseInt(singleDigitMatch[1], 10)
      return { skills: n, experience: n, seniority: n, techStack: n }
    }
    return null
  }

  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  return {
    skills: clamp(parseInt(skillsMatch[1], 10)),
    experience: clamp(parseInt(experienceMatch[1], 10)),
    seniority: clamp(parseInt(seniorityMatch[1], 10)),
    techStack: clamp(parseInt(techStackMatch[1], 10)),
  }
}

// ─── Build Breakdown ──────────────────────────────────────────────────────

function buildBreakdown(scores: AxisScores): MatchBreakdown {
  return {
    skills: {
      score: scores.skills,
      weight: WEIGHTS.skills,
      signals: { keyword: null, semantic: scores.skills / 100 },
    },
    experience: {
      score: scores.experience,
      weight: WEIGHTS.experience,
      signals: { keyword: null, semantic: scores.experience / 100 },
    },
    seniority: {
      score: scores.seniority,
      weight: WEIGHTS.seniority,
      signals: { keyword: null, semantic: scores.seniority / 100 },
    },
    techStack: {
      score: scores.techStack,
      weight: WEIGHTS.techStack,
      signals: { keyword: null, semantic: scores.techStack / 100 },
    },
  }
}

// ─── Main Scoring Function ────────────────────────────────────────────────

/**
 * Score a job using the local LLM (Qwen 3.5 2B via node-llama-cpp + Metal GPU).
 *
 * Returns per-axis scores (skills, experience, seniority, techStack) for
 * meaningful spider chart differentiation.
 *
 * Throws if no model is available — callers should ensure the model is
 * downloaded before running the pipeline.
 */
export async function scoreJob(
  job: NormalizedJob,
  resume: ParsedResume,
): Promise<{ matchScore: number; matchBreakdown: MatchBreakdown }> {
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
  const prompt = buildPrompt(resumeText, job.title, job.descriptionText)

  let axisScores: AxisScores | null = null

  const context = await llm.createContext()
  try {
    const session = llm.createSession(context)
    const response = await session.prompt(prompt, {
      maxTokens: 40,
      temperature: 0,
    })
    axisScores = extractAxisScores(response)
  } finally {
    await llm.disposeContext(context)
  }

  if (!axisScores) {
    throw new Error('LLM returned unparseable response. Check prompt or model.')
  }

  const matchBreakdown = buildBreakdown(axisScores)

  const matchScore = Math.round(
    axisScores.skills * WEIGHTS.skills +
    axisScores.experience * WEIGHTS.experience +
    axisScores.seniority * WEIGHTS.seniority +
    axisScores.techStack * WEIGHTS.techStack,
  )

  return { matchScore, matchBreakdown }
}
