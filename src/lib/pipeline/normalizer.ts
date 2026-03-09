import { createHash } from 'crypto'

import { inferRemote } from '@/lib/adapters/utils'
import { getZeroShotClassifier } from '@/lib/ai/models'
import { sanitizeHtml } from '@/lib/utils'

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

// ─── Benefits Extraction (Zero-Shot Classification) ────────────────────────

const BENEFIT_LABELS = [
  'health insurance',
  'retirement benefits',
  'paid time off',
  'equity compensation',
  'remote work',
  'parental leave',
  'professional development',
  'wellness benefits',
] as const

/** Extract benefits from description text using zero-shot classification */
async function extractBenefits(descriptionText: string): Promise<string[] | undefined> {
  if (!descriptionText || descriptionText.length < 10) return undefined

  // Split into sentences and classify in parallel
  const sentences = descriptionText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10)
    .slice(0, 5)

  if (sentences.length === 0) return undefined

  const classifier = await getZeroShotClassifier()
  const found = new Set<string>()

  const results = await Promise.all(
    sentences.map((sentence) => classifier(sentence, [...BENEFIT_LABELS])),
  )

  for (const raw of results) {
    const result = Array.isArray(raw) ? raw[0] : raw
    const labels = (result as { labels?: string[] }).labels ?? []
    const scores = (result as { scores?: number[] }).scores ?? []

    for (let i = 0; i < labels.length; i++) {
      if (scores[i] > 0.5) {
        found.add(labels[i])
      }
    }
  }

  return found.size > 0 ? [...found] : undefined
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

      // Extract benefits from description using zero-shot classification
      const benefits = options?.skipBenefits ? undefined : await extractBenefits(descriptionText)

      // Prepare search text for tsvector population at DB insert time
      const searchText = [title, company, descriptionText].filter(Boolean).join(' ')

      const source: SourceAttribution = {
        name: listing.source_name,
        external_id: listing.external_id,
        fetched_at: new Date().toISOString(),
      }

      const job: NormalizedJob = {
        externalId: listing.external_id,
        sourceName: listing.source_name,
        title,
        company,
        descriptionHtml: listing.description_html,
        descriptionText,
        salaryMin: listing.salary_min,
        salaryMax: listing.salary_max,
        location: location ?? undefined,
        isRemote,
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
