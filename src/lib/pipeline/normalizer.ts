import { createHash } from 'crypto'

import { inferRemote } from '@/lib/adapters/utils'
import { sanitizeHtml } from '@/lib/utils'

import { extractCountry } from './location'
import type { NormalizedJob, NormalizerResult, RawJobListing, SourceAttribution } from './types'

// ─── Fingerprint ────────────────────────────────────────────────────────────

/** Shared fingerprint generation — used by normalizer and deduplicator */
export function generateFingerprint(title: string, company: string, location: string): string {
  const input = (title + company + location)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

// ─── Title Case ─────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
}

// ─── Sanitize Text ──────────────────────────────────────────────────────────

/** Compose sanitizeHtml (XSS removal) + HTML tag stripping for plain text output */
function sanitizeText(text: string): string {
  return sanitizeHtml(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Normalizer ─────────────────────────────────────────────────────────────

export async function normalize(raw: RawJobListing[]): Promise<NormalizerResult> {
  const normalized: NormalizedJob[] = []
  let skippedCount = 0
  const seenFingerprints = new Set<string>()

  for (const listing of raw) {
    try {
      const title = toTitleCase(listing.title)
      const company = listing.company.trim()
      const location = listing.location?.trim()

      const fingerprint = generateFingerprint(
        title,
        company,
        location ?? '',
      )

      // Within-batch dedup: skip fingerprint-identical listings
      if (seenFingerprints.has(fingerprint)) {
        skippedCount++
        continue
      }
      seenFingerprints.add(fingerprint)

      // Preserve three-state is_remote contract from adapters
      const isRemote = listing.is_remote ?? inferRemote(listing.location)

      const descriptionText = sanitizeText(listing.description_text)

      // Prepare search text for tsvector population at DB insert time
      const searchText = [title, company, descriptionText].filter(Boolean).join(' ')

      const source: SourceAttribution = {
        name: listing.source_name,
        external_id: listing.external_id,
        fetched_at: new Date().toISOString(),
      }

      // Salary validation: cap suspect values as undefined
      const salaryMin = listing.salary_min != null && listing.salary_min > 500_000
        ? undefined
        : listing.salary_min
      const salaryMax = listing.salary_max != null && listing.salary_max > 1_000_000
        ? undefined
        : listing.salary_max

      const country = extractCountry(location)

      const job: NormalizedJob = {
        externalId: listing.external_id,
        sourceName: listing.source_name,
        title,
        company,
        descriptionHtml: listing.description_html,
        descriptionText,
        salaryMin,
        salaryMax,
        location: location ?? undefined,
        isRemote,
        country,
        sourceUrl: listing.source_url,
        applyUrl: listing.apply_url,
        benefits: undefined,
        rawData: listing.raw_data,
        fingerprint,
        searchText,
        sources: [source],
        discoveredAt: new Date(),
        pipelineStage: 'discovered',
      }

      normalized.push(job)
    } catch {
      skippedCount++
    }
  }

  return { normalized, skippedCount }
}
