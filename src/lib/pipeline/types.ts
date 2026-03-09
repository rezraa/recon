import type { RawJobListing } from '@/lib/adapters/types'

// ─── RRF Signal ─────────────────────────────────────────────────────────────

export interface Signal {
  rank: number
}

// ─── Normalized Job ─────────────────────────────────────────────────────────

export interface NormalizedJob {
  externalId: string
  sourceName: string
  title: string
  company: string
  descriptionHtml: string | undefined
  descriptionText: string
  salaryMin: number | undefined
  salaryMax: number | undefined
  location: string | undefined
  isRemote: boolean | undefined
  sourceUrl: string
  applyUrl: string | undefined
  benefits: string[] | undefined
  rawData: Record<string, unknown>
  fingerprint: string
  searchText: string
  sources: SourceAttribution[]
  discoveredAt: Date
  pipelineStage: string
}

// ─── Source Attribution ─────────────────────────────────────────────────────

export interface SourceAttribution {
  name: string
  external_id: string
  fetched_at: string
}

// ─── Dedup Types ────────────────────────────────────────────────────────────

export interface DedupCandidate {
  existing: NormalizedJob
  incoming: NormalizedJob
  confidence: number
}

export interface DedupResult {
  new: NormalizedJob[]
  updated: NormalizedJob[]
  similar: DedupCandidate[]
  duplicateCount: number
}

// ─── Normalizer Result ──────────────────────────────────────────────────────

export interface NormalizerResult {
  normalized: NormalizedJob[]
  skippedCount: number
}

// Re-export for convenience
export type { RawJobListing }
