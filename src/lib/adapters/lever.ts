/**
 * Lever ATS Adapter
 *
 * Fetches job listings from Lever's public Postings API.
 * Each company has a unique slug (e.g., "netflix", "twilio").
 * API: https://api.lever.co/v0/postings/{slug}
 *
 * No authentication required. Standard limit: 10 req/s.
 * POST (application submit) limited to 2/s — we only do GETs.
 */

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { delayWithJitter, fetchWithTimeout, inferRemote, stripHtml, validateListings } from './utils'

// ─── Configuration ──────────────────────────────────────────────────────────

const API_BASE = 'https://api.lever.co/v0/postings'
const DELAY_BETWEEN_COMPANIES_MS = 7_000

// ─── Types ──────────────────────────────────────────────────────────────────

interface LeverCategory {
  commitment?: string
  department?: string
  location?: string
  team?: string
}

interface LeverJob {
  id: string
  text: string
  descriptionPlain?: string
  description?: string
  additional?: string
  additionalPlain?: string
  categories: LeverCategory
  hostedUrl: string
  applyUrl: string
  createdAt: number
  workplaceType?: string // 'remote' | 'onsite' | 'hybrid' | 'unspecified'
  salaryRange?: {
    min: number
    max: number
    currency: string
    interval: string
  }
}

export interface LeverCompany {
  slug: string
  name: string
}

// ─── Seed Company List ──────────────────────────────────────────────────────

export const LEVER_COMPANIES: LeverCompany[] = [
  { slug: 'netflix', name: 'Netflix' },
  { slug: 'twilio', name: 'Twilio' },
  { slug: 'github', name: 'GitHub' },
  { slug: 'spotify', name: 'Spotify' },
  { slug: 'atlassian', name: 'Atlassian' },
  { slug: 'shopify', name: 'Shopify' },
  { slug: 'figma', name: 'Figma' },
  { slug: 'coda', name: 'Coda' },
  { slug: 'miro', name: 'Miro' },
  { slug: 'loom', name: 'Loom' },
  { slug: 'samsara', name: 'Samsara' },
  { slug: 'mux', name: 'Mux' },
  { slug: 'planetscale', name: 'PlanetScale' },
  { slug: 'prisma', name: 'Prisma' },
  { slug: 'temporal', name: 'Temporal' },
  { slug: 'tailscale', name: 'Tailscale' },
  { slug: 'nerdwallet', name: 'NerdWallet' },
  { slug: 'scale', name: 'Scale AI' },
  { slug: 'anduril', name: 'Anduril' },
  { slug: 'palantir', name: 'Palantir' },
]

// ─── Rate Limiter ───────────────────────────────────────────────────────────

let delayMs = DELAY_BETWEEN_COMPANIES_MS

/** Override delay for testing. */
export function _setDelay(ms: number): void {
  delayMs = ms
}

// ─── Fetch Jobs for a Single Company ────────────────────────────────────────

export async function fetchLeverCompany(
  slug: string,
  companyName: string,
): Promise<RawJobListing[]> {
  const url = `${API_BASE}/${slug}?mode=json`

  const response = await fetchWithTimeout(url, {}, 15_000)
  const data = (await response.json()) as LeverJob[]

  if (!Array.isArray(data)) return []

  const mapped = data.map((job): Record<string, unknown> => {
    const descriptionText = job.descriptionPlain
      ?? (job.description ? stripHtml(job.description) : '')
    const additionalText = job.additionalPlain
      ?? (job.additional ? stripHtml(job.additional) : '')
    const fullText = [descriptionText, additionalText].filter(Boolean).join(' ')

    const location = job.categories.location || undefined
    const isRemote = job.workplaceType === 'remote' || inferRemote(location)

    // Lever provides structured salary on some postings
    let salaryMin: number | undefined
    let salaryMax: number | undefined
    if (job.salaryRange) {
      salaryMin = job.salaryRange.min
      salaryMax = job.salaryRange.max
    }

    return {
      source_name: 'lever',
      external_id: `lever-${slug}-${job.id}`,
      title: job.text,
      company: companyName,
      source_url: job.hostedUrl,
      apply_url: job.applyUrl,
      description_text: fullText || job.text,
      description_html: job.description || undefined,
      salary_min: salaryMin,
      salary_max: salaryMax,
      location,
      is_remote: isRemote,
      raw_data: {
        lever_id: job.id,
        slug,
        department: job.categories.department,
        team: job.categories.team,
        commitment: job.categories.commitment,
        workplaceType: job.workplaceType,
        createdAt: job.createdAt,
      },
    }
  })

  return validateListings(mapped, `lever:${slug}`)
}

// ─── Main Adapter ───────────────────────────────────────────────────────────

export const leverAdapter: SourceAdapter = {
  name: 'lever',
  displayName: 'Lever',
  type: 'open',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    const allListings: RawJobListing[] = []
    const errors: string[] = []

    const companies = LEVER_COMPANIES

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i]

      try {
        const listings = await fetchLeverCompany(company.slug, company.name)

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

      if (i < companies.length - 1) {
        await delayWithJitter(delayMs)
      }
    }

    if (errors.length > 0) {
      console.warn(`[lever] ${errors.length} company fetch errors:`, errors.slice(0, 5))
    }

    return allListings
  },
}
