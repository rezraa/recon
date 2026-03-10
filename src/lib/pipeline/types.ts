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
  country: string       // ISO 3166-1 alpha-2 code or "Unknown"
  embedding?: number[]  // 384-dim pgvector embedding, populated after embed step
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
  /** Subset of updated jobs that had no match_score — need scoring */
  updatedNeedScore?: NormalizedJob[]
  similar: DedupCandidate[]
  duplicateCount: number
}

// ─── Normalizer Result ──────────────────────────────────────────────────────

export interface NormalizerResult {
  normalized: NormalizedJob[]
  skippedCount: number
}

// ─── Scoring Types ─────────────────────────────────────────────────────────

export interface ScoringAxisResult {
  score: number        // 0-100 per axis
  weight: number       // e.g. 0.35, 0.25, 0.20
  signals: {
    keyword: number | null   // keyword overlap score (0-1), null if no signal
    semantic: number | null  // embedding cosine similarity (0-1), null if no signal
  }
}

export interface MatchBreakdown {
  skills: ScoringAxisResult
  techStack: ScoringAxisResult
  experience: ScoringAxisResult
  salary: ScoringAxisResult
}

// Re-export for convenience
export type { RawJobListing }
