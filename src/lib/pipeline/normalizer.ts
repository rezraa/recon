import { createHash } from 'crypto'

import { inferRemote } from '@/lib/adapters/utils'
import { sanitizeHtml } from '@/lib/utils'

import { extractCountry } from './location'
import type { NormalizedJob, NormalizerResult, RawJobListing, SourceAttribution } from './types'

// ─── Options ──────────────────────────────────────────────────────────────

export interface NormalizeOptions {
  /** Skip expensive benefits extraction (use when jobs will likely be deduped) */
  skipBenefits?: boolean
}

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

/** Sanitize but preserve newlines (for section-based parsing like benefits) */
function sanitizeTextPreserveNewlines(text: string): string {
  return sanitizeHtml(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\S\n]+/g, ' ')   // collapse horizontal whitespace but keep \n
    .replace(/\n\s*\n/g, '\n')   // collapse multiple blank lines
    .trim()
}

// ─── Benefits Extraction (Section-Based — Domain-Agnostic) ─────────────────

/** Section headers that indicate a benefits/perks section (structural, not domain-specific) */
const BENEFITS_SECTION_PATTERN =
  /\b(?:benefits|what we offer|perks|compensation\s*(?:&|and)\s*benefits|our benefits|employee benefits|why join us|why work here)\b/i

/** Extract benefits by finding a benefits section and pulling bullet points verbatim */
function extractBenefits(descriptionText: string): string[] | undefined {
  if (!descriptionText || descriptionText.length < 10) return undefined

  // Split text into lines and find the benefits section header
  const lines = descriptionText.split(/\n/)
  let sectionStart = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // A section header is typically a short line (< 60 chars) matching our pattern
    if (line.length > 0 && line.length < 60 && BENEFITS_SECTION_PATTERN.test(line)) {
      sectionStart = i + 1
      break
    }
  }

  if (sectionStart === -1) return undefined

  // Extract bullet points / items until the next section header or end of text
  const items: string[] = []
  for (let i = sectionStart; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Stop at what looks like a new section header (short, all-caps or title-case, no bullet)
    if (line.length < 60 && /^[A-Z][A-Z\s]{3,}$/.test(line)) break
    if (line.length < 60 && !line.startsWith('-') && !line.startsWith('•') && !line.startsWith('*') && /^[A-Z][a-z]/.test(line) && !line.includes(':') && items.length > 0 && line.split(/\s+/).length <= 5) break

    // Extract bullet items (strip leading bullet chars)
    const cleaned = line.replace(/^[\s\-–—*•●◦▪·]+/, '').trim()
    if (cleaned.length >= 5 && cleaned.length < 200) {
      items.push(cleaned)
    }
  }

  return items.length > 0 ? items : undefined
}

// ─── Normalizer ─────────────────────────────────────────────────────────────

export async function normalize(raw: RawJobListing[], options?: NormalizeOptions): Promise<NormalizerResult> {
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

      // Extract benefits from section-based parsing (no ML model needed)
      // Use newline-preserving sanitization so section headers are detectable
      const benefits = options?.skipBenefits ? undefined : extractBenefits(
        sanitizeTextPreserveNewlines(listing.description_text),
      )

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
        benefits,
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
