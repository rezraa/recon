/**
 * Job Detail Enricher via SearXNG
 *
 * Enriches partial jobs by querying search engines (via SearXNG) for
 * cached/indexed content about a specific job. Never contacts job boards
 * directly — all data comes from what Google/Bing/Brave already indexed.
 *
 * Triggered only when a user clicks a job card (on-demand, not bulk).
 * One query per enrichment. Throttled to 3s between requests.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JobDetailResult {
  descriptionText: string
  descriptionHtml: string
  salary?: { min?: number; max?: number }
}

interface SearXNGResult {
  title: string
  url: string
  content: string
  engines: string[]
}

// ─── Configuration ──────────────────────────────────────────────────────────

const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://localhost:8080'
const DELAY_MS = 3000

// ─── Rate Limiter ───────────────────────────────────────────────────────────

let lastRequestTime = 0

async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS - elapsed))
  }
  lastRequestTime = Date.now()
}

/** Reset throttle state. For test isolation only. */
export function _resetThrottle(): void {
  lastRequestTime = 0
}

// ─── SearXNG Query ──────────────────────────────────────────────────────────

async function searxQuery(query: string): Promise<SearXNGResult[]> {
  await throttle()

  const params = new URLSearchParams({
    q: query,
    format: 'json',
  })

  try {
    const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: SearXNGResult[] }
    return data.results ?? []
  } catch {
    return []
  }
}

// ─── Relevance Filter ───────────────────────────────────────────────────────

/** Detect non-Latin text (CJK, Arabic, Cyrillic, etc.) */
function isNonLatin(text: string): boolean {
  // Count non-ASCII, non-punctuation characters
  const nonLatin = text.replace(/[\x00-\x7F]/g, '').length
  return nonLatin > text.length * 0.3
}

/** Known noise patterns in search snippets */
const NOISE_PATTERNS = [
  /sign\s+(up|in)\s+(to|for)/i,
  /join\s+to\s+apply/i,
  /create\s+(a\s+)?(?:free\s+)?account/i,
  /cookie|privacy\s+policy/i,
  /earn\s+.*points.*purchase/i,
  /log\s*in\s+to\s+view/i,
  /프로모션|소니코리아|뉴스룸/,  // Korean Sony promo
  /索尼|本站致力/,               // Chinese Sony
]

function isRelevantSnippet(
  snippet: string,
  _title: string,
  company: string,
  jobTitle: string,
): boolean {
  if (!snippet || snippet.length < 40) return false

  // Reject non-English/Latin text
  if (isNonLatin(snippet)) return false

  // Reject known noise
  if (NOISE_PATTERNS.some((p) => p.test(snippet))) return false

  const text = snippet.toLowerCase()
  const companyWords = company.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const titleWords = jobTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2)

  // Must contain at least one company word AND one title word
  const hasCompany = companyWords.some((w) => text.includes(w))
  const hasTitle = titleWords.some((w) => text.includes(w))

  return hasCompany && hasTitle
}

// ─── Salary Extraction ─────────────────────────────────────────────────────

export function extractSalaryFromText(text: string): { min?: number; max?: number } | undefined {
  // "$32 an hour", "$45/hr"
  const hourlyMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(?:an?\s+hour|\/\s*hr|\/\s*hour)/i)
  if (hourlyMatch) {
    const hourly = parseFloat(hourlyMatch[1])
    return { min: Math.round(hourly * 2080) }
  }

  // "$120k - $150k", "$120,000 - $150,000"
  const rangeMatch = text.match(
    /\$(\d{2,3}(?:,\d{3})*(?:\.\d+)?)(k)?\s*[-–—]+\s*\$(\d{2,3}(?:,\d{3})*(?:\.\d+)?)(k)?/i,
  )
  if (rangeMatch) {
    let min = parseFloat(rangeMatch[1].replace(/,/g, ''))
    let max = parseFloat(rangeMatch[3].replace(/,/g, ''))
    if (rangeMatch[2]?.toLowerCase() === 'k') min *= 1000
    if (rangeMatch[4]?.toLowerCase() === 'k') max *= 1000
    return { min, max }
  }

  return undefined
}

// ─── Main Enrichment Function ───────────────────────────────────────────────

/**
 * Enrich a job by querying SearXNG for cached search engine content.
 * Single query, ~3s with throttle. Never contacts job boards.
 *
 * @param jobTitle - The job title (e.g., "SDET Intern")
 * @param company - The company name (e.g., "Medidata Solutions")
 * @returns Enriched description or null if insufficient data found
 */
export async function fetchJobDetail(
  jobTitle: string,
  company: string,
): Promise<JobDetailResult | null> {
  const query = `"${company}" "${jobTitle}" job description requirements qualifications salary`
  const results = await searxQuery(query)

  const snippets: string[] = []
  let salary: { min?: number; max?: number } | undefined

  for (const r of results.slice(0, 10)) {
    const snippet = r.content?.trim()
    if (isRelevantSnippet(snippet, r.title, company, jobTitle)) {
      snippets.push(snippet)
      if (!salary) {
        salary = extractSalaryFromText(snippet)
      }
    }
  }

  if (snippets.length === 0) return null

  const unique = deduplicateSnippets(snippets)
  const combined = unique.join('\n\n')

  // Quality gate: need at least 200 chars of actual job content
  if (combined.length < 200) return null

  return {
    descriptionText: combined,
    descriptionHtml: unique.map((s) => `<p>${escapeHtml(s)}</p>`).join('\n'),
    salary,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function deduplicateSnippets(snippets: string[]): string[] {
  const unique: string[] = []
  for (const snippet of snippets) {
    const normalized = snippet.toLowerCase().slice(0, 80)
    if (!unique.some((u) => u.toLowerCase().slice(0, 80) === normalized)) {
      unique.push(snippet)
    }
  }
  return unique
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
