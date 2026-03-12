import { z } from 'zod'

// ─── Source Configuration ────────────────────────────────────────────────────

export interface RateLimitConfig {
  requestsPerHour: number | null
  requestsPerDay: number | null
  requestsPerMonth: number | null
  cooldownMs: number
}

export interface SourceConfig {
  name: string
  displayName: string
  type: 'open' | 'key_required'
  mode: 'feed' | 'search'
  description: string
  signupUrl?: string
  regions: string[] // ISO 3166-1 alpha-2 codes: ['US'], ['US', 'GB'], ['*'] for global/remote

  attribution: {
    requiresFollowLink: boolean
    attributionUrl: string
    descriptionPolicy: 'no_modify'
  }

  rateLimits: RateLimitConfig
}

// ─── Raw Job Listing Schema ─────────────────────────────────────────────────

export const rawJobListingSchema = z.object({
  source_name: z.string().min(1),
  external_id: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  source_url: z.string().url(),
  apply_url: z.string().url().optional(),
  description_text: z.string().min(1),
  description_html: z.string().optional(),
  salary_min: z.number().nonnegative().optional(),
  salary_max: z.number().nonnegative().optional(),
  location: z.string().min(1).optional(),
  is_remote: z.boolean().optional(),
  raw_data: z.record(z.string(), z.unknown()),
  // NO company_logo — text + letter avatars only
  // NO source_logo — text attribution only
})

export type RawJobListing = z.infer<typeof rawJobListingSchema>

// ─── Adapter Config ─────────────────────────────────────────────────────────

export interface AdapterConfig {
  apiKey?: string
  preferences: {
    targetTitles: string[]
    locations: string[]
    remotePreference: string | null
  }
}

// ─── Source Adapter Interface ───────────────────────────────────────────────

export interface SourceAdapter {
  name: string
  displayName: string
  type: 'open' | 'key_required'
  fetchListings(config: AdapterConfig): Promise<RawJobListing[]>
  validateKey?(key: string): Promise<boolean>
  getRateLimitStatus?(): { remaining: number; resetsAt: Date } | null
}

// ─── Source Fetch Result ────────────────────────────────────────────────────

export interface SourceFetchResult {
  listings: RawJobListing[]
  fetchedAt: Date
  count: number
  source_name: string
}

// ─── Rate Limit Tracker Interface (Implemented in Stories 2-5/2-9) ──────────

export interface RateLimitTracker {
  canMakeRequest(sourceName: string): Promise<boolean>
  recordRequest(sourceName: string): Promise<void>
  getRemainingQuota(sourceName: string): Promise<{
    hourly: number | null
    daily: number | null
    monthly: number | null
    nextAllowedAt: Date | null
  }>
}
