import { and, eq, or, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import { cosineSimilarity } from '@/lib/ai/embeddings'
import * as schema from '@/lib/db/schema'

import { generateFingerprint } from './normalizer'
import { computeRRFScore } from './rrf'
import { jaroWinkler, locationSimilarity, salaryOverlap } from './similarity'
import type { DedupResult, NormalizedJob, Signal, SourceAttribution } from './types'

// ─── Thresholds ─────────────────────────────────────────────────────────────

const AUTO_MERGE_THRESHOLD = 0.90
const SIMILAR_THRESHOLD = 0.70

// ─── Types ──────────────────────────────────────────────────────────────────

type DrizzleDb = PostgresJsDatabase<typeof schema>

// ─── Deduplicator ───────────────────────────────────────────────────────────

export async function deduplicate(
  normalized: NormalizedJob[],
  db: DrizzleDb,
): Promise<DedupResult> {
  const result: DedupResult = {
    new: [],
    updated: [],
    updatedNeedScore: [],
    similar: [],
    duplicateCount: 0,
  }

  for (const job of normalized) {
    // Step 1: Same-source detection (unique index: source_name + external_id)
    const existing = await db
      .select()
      .from(schema.jobsTable)
      .where(
        and(
          eq(schema.jobsTable.sourceName, job.sourceName),
          eq(schema.jobsTable.externalId, job.externalId),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      const record = existing[0]
      // Update existing record with new data (field-level enrichment)
      const updates: Record<string, unknown> = {}

      // Backfill NULLs but never overwrite non-NULL with NULL
      if (record.salaryMin === null && job.salaryMin !== undefined) updates.salaryMin = job.salaryMin
      if (record.salaryMax === null && job.salaryMax !== undefined) updates.salaryMax = job.salaryMax
      if (record.location === null && job.location !== undefined) updates.location = job.location
      if (record.isRemote === null && job.isRemote !== undefined) updates.isRemote = job.isRemote
      if (record.descriptionHtml === null && job.descriptionHtml !== undefined) updates.descriptionHtml = job.descriptionHtml
      if (record.descriptionText === null && job.descriptionText) updates.descriptionText = job.descriptionText
      if (record.applyUrl === null && job.applyUrl !== undefined) updates.applyUrl = job.applyUrl

      // Merge sources array
      const existingSources = (record.sources as SourceAttribution[] | null) ?? []
      const sourceExists = existingSources.some(
        (s) => s.name === job.sourceName && s.external_id === job.externalId,
      )
      if (!sourceExists) {
        updates.sources = [...existingSources, ...job.sources]
      }

      // Never overwrite: discoveredAt, pipelineStage, reviewedAt, appliedAt
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date()
        await db
          .update(schema.jobsTable)
          .set(updates)
          .where(eq(schema.jobsTable.id, record.id))
      }

      result.updated.push(job)
      if (record.matchScore === null) {
        result.updatedNeedScore!.push(job)
      }
      result.duplicateCount++
      continue
    }

    // Step 2: Cross-source dedup with RRF confidence scoring
    // Use pgvector nearest-neighbor when embedding available, fallback to SQL text match
    const embeddingLiteral = job.embedding ? `[${job.embedding.join(',')}]` : null
    const candidates = embeddingLiteral
      ? await db
          .select()
          .from(schema.jobsTable)
          .where(sql`${schema.jobsTable.embedding} <=> ${embeddingLiteral}::vector < 0.5`)
          .limit(50)
      : await db
          .select()
          .from(schema.jobsTable)
          .where(
            or(
              sql`lower(${schema.jobsTable.company}) = lower(${job.company})`,
              sql`lower(${schema.jobsTable.title}) = lower(${job.title})`,
            ),
          )
          .limit(50)

    let bestMatch: { record: typeof candidates[0]; confidence: number } | null = null

    for (const candidate of candidates) {
      const signals: (Signal | null)[] = []

      // Signal 1: Fingerprint (exact match) — always compute, not conditional on descriptionText
      const candidateFingerprint = generateFingerprint(
        candidate.title ?? '',
        candidate.company ?? '',
        candidate.location ?? '',
      )
      signals.push({ rank: candidateFingerprint === job.fingerprint ? 1 : 100 })

      // Signal 2: Company similarity (Jaro-Winkler)
      const companySim = jaroWinkler(
        job.company.toLowerCase(),
        (candidate.company ?? '').toLowerCase(),
      )
      signals.push({ rank: Math.max(1, Math.round((1 - companySim) * 100)) })

      // Signal 3: Location similarity
      if (job.location && candidate.location) {
        const locSim = locationSimilarity(job.location, candidate.location)
        signals.push({ rank: Math.max(1, Math.round((1 - locSim) * 100)) })
      } else {
        signals.push(null)
      }

      // Signal 4: Salary overlap
      const salaryScore = salaryOverlap(
        { min: job.salaryMin, max: job.salaryMax },
        { min: candidate.salaryMin ?? undefined, max: candidate.salaryMax ?? undefined },
      )
      if (salaryScore !== null) {
        signals.push({ rank: Math.max(1, Math.round((1 - salaryScore) * 100)) })
      } else {
        signals.push(null)
      }

      // Signal 5: Title embedding similarity via cosine
      const candidateEmbedding = candidate.embedding as number[] | null
      if (job.embedding && candidateEmbedding) {
        const jobEmb = new Float32Array(job.embedding)
        const candEmb = new Float32Array(candidateEmbedding)
        const sim = cosineSimilarity(jobEmb, candEmb)
        signals.push({ rank: Math.max(1, Math.round((1 - sim) * 100)) })
      } else {
        signals.push(null)
      }

      const confidence = computeRRFScore(signals)

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { record: candidate, confidence }
      }
    }

    if (bestMatch && bestMatch.confidence > AUTO_MERGE_THRESHOLD) {
      // Auto-merge: keep richer record, backfill NULLs
      const record = bestMatch.record
      const updates: Record<string, unknown> = {}

      // Backfill NULLs from incoming job
      if (record.salaryMin === null && job.salaryMin !== undefined) updates.salaryMin = job.salaryMin
      if (record.salaryMax === null && job.salaryMax !== undefined) updates.salaryMax = job.salaryMax
      if (record.location === null && job.location !== undefined) updates.location = job.location
      if (record.isRemote === null && job.isRemote !== undefined) updates.isRemote = job.isRemote
      if (record.descriptionHtml === null && job.descriptionHtml !== undefined) updates.descriptionHtml = job.descriptionHtml
      if (record.descriptionText === null && job.descriptionText) updates.descriptionText = job.descriptionText
      if (record.applyUrl === null && job.applyUrl !== undefined) updates.applyUrl = job.applyUrl

      // Merge sources arrays
      const existingSources = (record.sources as SourceAttribution[] | null) ?? []
      const mergedSources = [...existingSources]
      for (const source of job.sources) {
        const exists = mergedSources.some(
          (s) => s.name === source.name && s.external_id === source.external_id,
        )
        if (!exists) mergedSources.push(source)
      }
      updates.sources = mergedSources
      updates.dedupConfidence = bestMatch.confidence
      updates.updatedAt = new Date()

      await db
        .update(schema.jobsTable)
        .set(updates)
        .where(eq(schema.jobsTable.id, record.id))

      result.updated.push(job)
      if (bestMatch.record.matchScore === null) {
        result.updatedNeedScore!.push(job)
      }
      result.duplicateCount++
    } else if (bestMatch && bestMatch.confidence >= SIMILAR_THRESHOLD) {
      // Flag as similar
      result.similar.push({
        existing: dbRecordToNormalizedJob(bestMatch.record),
        incoming: job,
        confidence: bestMatch.confidence,
      })
      result.new.push(job)
    } else {
      // New listing
      result.new.push(job)
    }
  }

  return result
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dbRecordToNormalizedJob(record: {
  externalId: string
  sourceName: string
  title: string | null
  company: string | null
  descriptionHtml: string | null
  descriptionText: string | null
  salaryMin: number | null
  salaryMax: number | null
  location: string | null
  isRemote: boolean | null
  sourceUrl: string | null
  applyUrl: string | null
  benefits: unknown
  rawData: unknown
  sources: unknown
  country: string | null
  dedupConfidence: number | null
  pipelineStage: string | null
  discoveredAt: Date | null
}): NormalizedJob {
  const title = record.title ?? ''
  const company = record.company ?? ''
  const descriptionText = record.descriptionText ?? ''
  return {
    externalId: record.externalId,
    sourceName: record.sourceName,
    title,
    company,
    descriptionHtml: record.descriptionHtml ?? undefined,
    descriptionText,
    salaryMin: record.salaryMin ?? undefined,
    salaryMax: record.salaryMax ?? undefined,
    location: record.location ?? undefined,
    isRemote: record.isRemote ?? undefined,
    sourceUrl: record.sourceUrl ?? '',
    applyUrl: record.applyUrl ?? undefined,
    benefits: Array.isArray(record.benefits) ? record.benefits as string[] : undefined,
    rawData: (record.rawData as Record<string, unknown>) ?? {},
    fingerprint: generateFingerprint(title, company, record.location ?? ''),
    searchText: [title, company, descriptionText].filter(Boolean).join(' '),
    country: record.country ?? 'Unknown',
    sources: (record.sources as SourceAttribution[]) ?? [],
    discoveredAt: record.discoveredAt ?? new Date(),
    pipelineStage: record.pipelineStage ?? 'discovered',
  }
}
