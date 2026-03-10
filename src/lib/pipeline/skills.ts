/**
 * Domain-agnostic skill matching.
 * Computes which of the user's resume skills appear in a job description.
 * Uses word-boundary-safe matching — "Go" won't match "go above and beyond".
 */

/**
 * Find which skills from the array appear in the description.
 * - Alpha-only terms use word-boundary regex
 * - Terms with special chars (C#, C++, Node.js) use case-insensitive includes
 */
export function extractSkillMatches(description: string, skills: string[]): string[] {
  if (!description || skills.length === 0) return []

  const descLower = description.toLowerCase()
  const matched: string[] = []

  for (const skill of skills) {
    const lower = skill.toLowerCase().trim()
    if (!lower) continue

    if (/[^a-z0-9\s]/.test(lower)) {
      // Special chars (C#, C++, Node.js, CI/CD) — use includes
      if (descLower.includes(lower)) {
        matched.push(skill)
      }
    } else {
      // Alpha-only — use word boundary regex
      // Short terms (≤3 chars like "Go", "R") use case-sensitive to avoid matching common English words
      const trimmed = skill.trim()
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const flags = trimmed.length <= 3 ? '' : 'i'
      if (new RegExp(`\\b${escaped}\\b`, flags).test(description)) {
        matched.push(skill)
      }
    }
  }

  return matched
}
