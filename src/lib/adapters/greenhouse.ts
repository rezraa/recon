/**
 * Greenhouse ATS Adapter
 *
 * Fetches job listings from Greenhouse's public board API.
 * Each company has a unique board slug (e.g., "stripe", "airbnb").
 * API docs: https://developers.greenhouse.io/job-board.html
 *
 * No authentication required — these are public APIs designed for
 * embedding job boards on company websites.
 */

import type { AdapterConfig, RawJobListing, SourceAdapter } from './types'
import { delayWithJitter, fetchWithTimeout, inferRemote, parseSalaryString, stripHtml, validateListings } from './utils'

// ─── Configuration ──────────────────────────────────────────────────────────

const API_BASE = 'https://boards-api.greenhouse.io/v1/boards'
const DELAY_BETWEEN_COMPANIES_MS = 7_000

// ─── Types ──────────────────────────────────────────────────────────────────

interface GreenhouseJob {
  id: number
  title: string
  updated_at: string
  absolute_url: string
  location: {
    name: string
  }
  content?: string
  departments?: Array<{ name: string }>
  offices?: Array<{ name: string; location: string }>
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[]
  meta?: { total: number }
}

export interface GreenhouseCompany {
  slug: string
  name: string
}

// ─── Seed Company List ──────────────────────────────────────────────────────

/**
 * Initial seed list of US tech companies using Greenhouse.
 * These are all verified working slugs.
 */
// TODO: uncomment full list when going live — just Stripe for smoke testing
export const GREENHOUSE_COMPANIES: GreenhouseCompany[] = [
  { slug: 'stripe', name: 'Stripe' },
  // { slug: 'airbnb', name: 'Airbnb' },
  // { slug: 'cloudflare', name: 'Cloudflare' },
  // { slug: 'datadog', name: 'Datadog' },
  // { slug: 'mongodb', name: 'MongoDB' },
  // { slug: 'discord', name: 'Discord' },
  // { slug: 'figma', name: 'Figma' },
  // { slug: 'cockroachlabs', name: 'Cockroach Labs' },
  // { slug: 'netflix', name: 'Netflix' },
  // { slug: 'airtable', name: 'Airtable' },
  // { slug: 'notion', name: 'Notion' },
  // { slug: 'plaid', name: 'Plaid' },
  // { slug: 'gusto', name: 'Gusto' },
  // { slug: 'brex', name: 'Brex' },
  // { slug: 'openai', name: 'OpenAI' },
  // { slug: 'anthropic', name: 'Anthropic' },
  // { slug: 'squarespace', name: 'Squarespace' },
  // { slug: 'hashicorp', name: 'HashiCorp' },
  // { slug: 'gitlab', name: 'GitLab' },
  // { slug: 'coreweave', name: 'CoreWeave' },
  // { slug: 'navan', name: 'Navan' },
  // { slug: 'hubspot', name: 'HubSpot' },
  // { slug: 'duolingo', name: 'Duolingo' },
  // { slug: 'dropbox', name: 'Dropbox' },
  // { slug: 'snyk', name: 'Snyk' },
  // { slug: 'confluent', name: 'Confluent' },
  // { slug: 'postman', name: 'Postman' },
  // { slug: 'grafana', name: 'Grafana Labs' },
  // { slug: 'elastic', name: 'Elastic' },
  // { slug: 'dbt', name: 'dbt Labs' },
  // { slug: 'netlify', name: 'Netlify' },
  // { slug: 'fly', name: 'Fly.io' },
  // { slug: 'supabase', name: 'Supabase' },
  // { slug: 'robinhood', name: 'Robinhood' },
  // { slug: 'coinbase', name: 'Coinbase' },
  // { slug: 'sofi', name: 'SoFi' },
  // { slug: 'affirm', name: 'Affirm' },
  // { slug: 'chime', name: 'Chime' },
  // { slug: 'crowdstrike', name: 'CrowdStrike' },
  // { slug: 'paloaltonetworks', name: 'Palo Alto Networks' },
  // { slug: 'zscaler', name: 'Zscaler' },
  // { slug: 'okta', name: 'Okta' },
  // { slug: 'databricks', name: 'Databricks' },
  // { slug: 'canva', name: 'Canva' },
  // { slug: 'reddit', name: 'Reddit' },
  // { slug: 'instacart', name: 'Instacart' },
  // { slug: 'doordash', name: 'DoorDash' },
  // { slug: 'lyft', name: 'Lyft' },
  // { slug: 'twitch', name: 'Twitch' },
  // { slug: 'pinterest', name: 'Pinterest' },
  // { slug: 'snap', name: 'Snap' },
]

// ─── Rate Limiter ───────────────────────────────────────────────────────────

let delayMs = DELAY_BETWEEN_COMPANIES_MS

/** Override delay for testing. */
export function _setDelay(ms: number): void {
  delayMs = ms
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseLocation(job: GreenhouseJob): { location?: string; isRemote?: boolean } {
  const locName = job.location?.name ?? ''

  // Greenhouse uses "Remote" or "Remote - US" style location names
  const isRemote = inferRemote(locName)

  // Try to get a real location from offices
  const officeLoc = job.offices?.[0]?.location || job.offices?.[0]?.name
  const location = locName || officeLoc || undefined

  return { location, isRemote }
}

function parseSalaryFromContent(content: string): { min?: number; max?: number } {
  // Greenhouse sometimes includes salary in the job description HTML
  const salaryMatch = content.match(
    /(?:salary|compensation|pay)\s*(?:range)?[:\s]*\$?([\d,]+(?:\.\d+)?)\s*(?:k)?\s*[-–—to]+\s*\$?([\d,]+(?:\.\d+)?)\s*(?:k)?/i,
  )
  if (salaryMatch) {
    return parseSalaryString(`${salaryMatch[1]}-${salaryMatch[2]}`)
  }
  return {}
}

// ─── Fetch Jobs for a Single Company ────────────────────────────────────────

export async function fetchGreenhouseCompany(
  slug: string,
  companyName: string,
): Promise<RawJobListing[]> {
  const url = `${API_BASE}/${slug}/jobs?content=true`

  const response = await fetchWithTimeout(url, {}, 15_000)
  const data = (await response.json()) as GreenhouseResponse

  if (!data.jobs || !Array.isArray(data.jobs)) return []

  const mapped = data.jobs.map((job): Record<string, unknown> => {
    const descriptionHtml = job.content ?? ''
    const descriptionText = stripHtml(descriptionHtml)
    const { location, isRemote } = parseLocation(job)
    const salary = parseSalaryFromContent(descriptionText)

    return {
      source_name: 'greenhouse',
      external_id: `gh-${slug}-${job.id}`,
      title: job.title,
      company: companyName,
      source_url: job.absolute_url,
      apply_url: job.absolute_url,
      description_text: descriptionText || job.title,
      description_html: descriptionHtml || undefined,
      salary_min: salary.min,
      salary_max: salary.max,
      location,
      is_remote: isRemote,
      raw_data: {
        greenhouse_id: job.id,
        slug,
        departments: job.departments?.map((d) => d.name),
        offices: job.offices,
        updated_at: job.updated_at,
      },
    }
  })

  return validateListings(mapped, `greenhouse:${slug}`)
}

// ─── Main Adapter ───────────────────────────────────────────────────────────

export const greenhouseAdapter: SourceAdapter = {
  name: 'greenhouse',
  displayName: 'Greenhouse',
  type: 'open',

  async fetchListings(config: AdapterConfig): Promise<RawJobListing[]> {
    const allListings: RawJobListing[] = []
    const errors: string[] = []

    // Use configured companies or fall back to seed list
    const companies = GREENHOUSE_COMPANIES

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i]

      try {
        const listings = await fetchGreenhouseCompany(company.slug, company.name)

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

      // Rate limit between companies (skip delay after last one)
      if (i < companies.length - 1) {
        await delayWithJitter(delayMs)
      }
    }

    if (errors.length > 0) {
      console.warn(`[greenhouse] ${errors.length} company fetch errors:`, errors.slice(0, 5))
    }

    return allListings
  },
}
