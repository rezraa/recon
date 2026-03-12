/**
 * Ashby ATS Adapter
 *
 * Fetches job listings from Ashby's public posting API.
 * Each company has a unique board slug (e.g., "ramp", "linear").
 * API: https://api.ashbyhq.com/posting-api/job-board/{slug}
 *
 * No authentication required — public API for company career pages.
 */

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { delayWithJitter, fetchWithTimeout, inferRemote, stripHtml, validateListings } from './utils'

// ─── Configuration ──────────────────────────────────────────────────────────

const API_BASE = 'https://api.ashbyhq.com/posting-api/job-board'
const DELAY_BETWEEN_COMPANIES_MS = 7_000 // Ashby: 15 req/min limit — generous buffer

// ─── Types ──────────────────────────────────────────────────────────────────

interface AshbyJob {
  id: string
  title: string
  location: string
  department: string
  team?: string
  publishedAt: string
  jobUrl: string
  descriptionHtml?: string
  descriptionPlain?: string
  isRemote?: boolean
  compensationTierSummary?: string
}

interface AshbyResponse {
  jobs: AshbyJob[]
  apiVersion: string
}

export interface AshbyCompany {
  slug: string
  name: string
}

// ─── Seed Company List ──────────────────────────────────────────────────────

export const ASHBY_COMPANIES: AshbyCompany[] = [
  // Fintech
  { slug: 'ramp', name: 'Ramp' },
  { slug: 'brex', name: 'Brex' },
  // Dev tools / Infra
  { slug: 'linear', name: 'Linear' },
  { slug: 'vercel', name: 'Vercel' },
  { slug: 'railway', name: 'Railway' },
  { slug: 'resend', name: 'Resend' },
  { slug: 'neon', name: 'Neon' },
  // AI / ML
  { slug: 'cohere', name: 'Cohere' },
  { slug: 'mistral', name: 'Mistral AI' },
  { slug: 'perplexityai', name: 'Perplexity AI' },
  { slug: 'replit', name: 'Replit' },
  // Other
  { slug: 'notion', name: 'Notion' },
  { slug: 'mercury', name: 'Mercury' },
  { slug: 'retool', name: 'Retool' },
  { slug: 'deel', name: 'Deel' },
  { slug: 'lattice', name: 'Lattice' },
  { slug: 'clerk', name: 'Clerk' },
  { slug: 'warp', name: 'Warp' },
  { slug: 'drata', name: 'Drata' },
  { slug: 'loom', name: 'Loom' },
]

// ─── Rate Limiter ───────────────────────────────────────────────────────────

let delayMs = DELAY_BETWEEN_COMPANIES_MS

/** Override delay for testing. */
export function _setDelay(ms: number): void {
  delayMs = ms
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseSalaryFromCompensation(summary: string | undefined): { min?: number; max?: number } {
  if (!summary) return {}

  // Ashby compensationTierSummary: "$150,000 - $200,000" or "$150K - $200K USD"
  const match = summary.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:k)?\s*[-–—to]+\s*\$?([\d,]+(?:\.\d+)?)\s*(?:k)?/i)
  if (match) {
    let min = parseFloat(match[1].replace(/,/g, ''))
    let max = parseFloat(match[2].replace(/,/g, ''))
    // If values are small (like 150), they're probably in K
    if (min < 1000 && summary.toLowerCase().includes('k')) min *= 1000
    if (max < 1000 && summary.toLowerCase().includes('k')) max *= 1000
    return { min, max }
  }
  return {}
}

// ─── Fetch Jobs for a Single Company ────────────────────────────────────────

export async function fetchAshbyCompany(
  slug: string,
  companyName: string,
): Promise<RawJobListing[]> {
  const url = `${API_BASE}/${slug}`

  const response = await fetchWithTimeout(url, {}, 15_000)
  const data = (await response.json()) as AshbyResponse

  if (!data.jobs || !Array.isArray(data.jobs)) return []

  const mapped = data.jobs.map((job): Record<string, unknown> => {
    const descriptionHtml = job.descriptionHtml ?? ''
    const descriptionText = job.descriptionPlain ?? stripHtml(descriptionHtml)
    const salary = parseSalaryFromCompensation(job.compensationTierSummary)

    return {
      source_name: 'ashby',
      external_id: `ashby-${slug}-${job.id}`,
      title: job.title,
      company: companyName,
      source_url: job.jobUrl,
      apply_url: job.jobUrl,
      description_text: descriptionText || job.title,
      description_html: descriptionHtml || undefined,
      salary_min: salary.min,
      salary_max: salary.max,
      location: job.location || undefined,
      is_remote: job.isRemote ?? inferRemote(job.location),
      raw_data: {
        ashby_id: job.id,
        slug,
        department: job.department,
        team: job.team,
        publishedAt: job.publishedAt,
        compensationTierSummary: job.compensationTierSummary,
      },
    }
  })

  return validateListings(mapped, `ashby:${slug}`)
}

// ─── Main Adapter ───────────────────────────────────────────────────────────

export const ashbyAdapter: SourceAdapter = {
  name: 'ashby',
  displayName: 'Ashby',
  type: 'open',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    const allListings: RawJobListing[] = []
    const errors: string[] = []

    const companies = ASHBY_COMPANIES

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i]

      try {
        const listings = await fetchAshbyCompany(company.slug, company.name)

        // Filter by target titles if specified
        const filtered = config.preferences.targetTitles.length > 0
          ? listings.filter((listing) => {
              const title = listing.title.toLowerCase()
              return config.preferences.targetTitles.some((target) =>
                title.includes(target.toLowerCase()),
              )
            })
          : listings

        allListings.push(...filtered)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${company.slug}: ${msg}`)
      }

      // Rate limit between companies
      if (i < companies.length - 1) {
        await delayWithJitter(delayMs)
      }
    }

    if (errors.length > 0) {
      console.warn(`[ashby] ${errors.length} company fetch errors:`, errors.slice(0, 5))
    }

    return allListings
  },
}
