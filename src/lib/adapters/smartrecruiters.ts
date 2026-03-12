/**
 * SmartRecruiters ATS Adapter
 *
 * Fetches job listings from SmartRecruiters' public posting API.
 * Each company has a unique ID (e.g., "Visa", "BOSCH").
 * API: https://api.smartrecruiters.com/v1/companies/{id}/postings
 *
 * No authentication required — public API for company career pages.
 * Paginated: 100 results per page, use offset parameter.
 */

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { delayWithJitter, fetchWithTimeout, inferRemote, stripHtml, validateListings } from './utils'

// ─── Configuration ──────────────────────────────────────────────────────────

const API_BASE = 'https://api.smartrecruiters.com/v1/companies'
const PAGE_SIZE = 100
const MAX_PAGES = 5 // 500 jobs max per company
const DELAY_BETWEEN_COMPANIES_MS = 7_000

// ─── Types ──────────────────────────────────────────────────────────────────

interface SmartRecruitersJob {
  id: string
  name: string
  uuid: string
  refNumber?: string
  company: { name: string; identifier: string }
  location: {
    city?: string
    region?: string
    country?: string
    remote?: boolean
  }
  department?: { label: string }
  typeOfEmployment?: { label: string }
  experienceLevel?: { label: string }
  releasedDate: string
  customField?: Array<{ fieldLabel: string; valueLabel: string }>
}

interface SmartRecruitersResponse {
  content: SmartRecruitersJob[]
  totalFound: number
  limit: number
  offset: number
}

export interface SmartRecruitersCompany {
  slug: string
  name: string
}

// ─── Seed Company List ──────────────────────────────────────────────────────

export const SMARTRECRUITERS_COMPANIES: SmartRecruitersCompany[] = [
  // Enterprise
  { slug: 'Visa', name: 'Visa' },
  { slug: 'BOSCH', name: 'Bosch' },
  { slug: 'Samsungelectronics', name: 'Samsung Electronics' },
  { slug: 'SmartRecruiters', name: 'SmartRecruiters' },
  { slug: 'Spotify', name: 'Spotify' },
  { slug: 'Skechers', name: 'Skechers' },
  { slug: 'TravisPerkins', name: 'Travis Perkins' },
  { slug: 'Capgemini', name: 'Capgemini' },
  { slug: 'PepsiCo', name: 'PepsiCo' },
  { slug: 'Adidas', name: 'Adidas' },
  { slug: 'Equinix', name: 'Equinix' },
  { slug: 'IKEA', name: 'IKEA' },
  { slug: 'Autodesk', name: 'Autodesk' },
  { slug: 'LinkedIn', name: 'LinkedIn' },
  { slug: 'FireEye', name: 'Trellix (FireEye)' },
]

// ─── Rate Limiter ───────────────────────────────────────────────────────────

let delayMs = DELAY_BETWEEN_COMPANIES_MS

/** Override delay for testing. */
export function _setDelay(ms: number): void {
  delayMs = ms
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function formatLocation(loc: SmartRecruitersJob['location']): string | undefined {
  const parts: string[] = []
  if (loc.city) parts.push(loc.city)
  if (loc.region) parts.push(loc.region)
  if (loc.country && !loc.region) parts.push(loc.country)
  return parts.length > 0 ? parts.join(', ') : undefined
}

function buildJobUrl(companySlug: string, jobId: string): string {
  return `https://jobs.smartrecruiters.com/${companySlug}/${jobId}`
}

// ─── Fetch Jobs for a Single Company ────────────────────────────────────────

export async function fetchSmartRecruitersCompany(
  slug: string,
  companyName: string,
): Promise<RawJobListing[]> {
  const allJobs: SmartRecruitersJob[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE
    const url = `${API_BASE}/${slug}/postings?limit=${PAGE_SIZE}&offset=${offset}`

    const response = await fetchWithTimeout(url, {}, 15_000)
    const data = (await response.json()) as SmartRecruitersResponse

    if (!data.content || !Array.isArray(data.content)) break

    allJobs.push(...data.content)

    // Stop if we've fetched all jobs
    if (allJobs.length >= data.totalFound || data.content.length < PAGE_SIZE) break

    // Small delay between pages
    if (page < MAX_PAGES - 1 && data.content.length === PAGE_SIZE) {
      await delayWithJitter(200)
    }
  }

  const mapped = allJobs.map((job): Record<string, unknown> => {
    const location = formatLocation(job.location)
    const isRemote = job.location.remote ?? inferRemote(location)
    const jobUrl = buildJobUrl(slug, job.id)

    return {
      source_name: 'smartrecruiters',
      external_id: `sr-${slug}-${job.uuid}`,
      title: job.name,
      company: companyName,
      source_url: jobUrl,
      apply_url: jobUrl,
      description_text: job.name, // SmartRecruiters listing API doesn't include description
      location,
      is_remote: isRemote,
      raw_data: {
        smartrecruiters_id: job.id,
        uuid: job.uuid,
        slug,
        refNumber: job.refNumber,
        department: job.department?.label,
        typeOfEmployment: job.typeOfEmployment?.label,
        experienceLevel: job.experienceLevel?.label,
        releasedDate: job.releasedDate,
      },
    }
  })

  return validateListings(mapped, `smartrecruiters:${slug}`)
}

// ─── Main Adapter ───────────────────────────────────────────────────────────

export const smartrecruitersAdapter: SourceAdapter = {
  name: 'smartrecruiters',
  displayName: 'SmartRecruiters',
  type: 'open',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    const allListings: RawJobListing[] = []
    const errors: string[] = []

    const companies = SMARTRECRUITERS_COMPANIES

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i]

      try {
        const listings = await fetchSmartRecruitersCompany(company.slug, company.name)

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
      console.warn(`[smartrecruiters] ${errors.length} company fetch errors:`, errors.slice(0, 5))
    }

    return allListings
  },
}
