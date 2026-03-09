import type { Job } from 'bullmq'
import { and, eq, sql } from 'drizzle-orm'

import { getEnabledAdapters } from '@/lib/adapters/registry'
import type { AdapterConfig, SourceAdapter } from '@/lib/adapters/types'
import { computeEmbedding } from '@/lib/ai/embeddings'
import { getDb } from '@/lib/db/client'
import { getResume } from '@/lib/db/queries/resume'
import { getSourceApiKey } from '@/lib/db/queries/sources'
import * as schema from '@/lib/db/schema'
import { deduplicate } from '@/lib/pipeline/deduplicator'
import { normalize, type NormalizeOptions } from '@/lib/pipeline/normalizer'
import type { ParsedResume } from '@/lib/pipeline/resumeTypes'
import { scoreJob } from '@/lib/pipeline/scoring'
import type { NormalizedJob } from '@/lib/pipeline/types'

import { log } from '../logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiscoveryJobData {
  runId: string
  sourceNames: string[]
}

interface SourceError {
  source: string
  error: string
  timestamp: string
}

// ─── Resume Loading ─────────────────────────────────────────────────────────

async function loadResume(): Promise<ParsedResume | null> {
  const resumeRow = await getResume()
  if (!resumeRow) return null

  const skills = Array.isArray(resumeRow.skills) ? resumeRow.skills as string[] : []
  const experience = Array.isArray(resumeRow.experience)
    ? (resumeRow.experience as Array<{ title: string; company: string; years: number | null }>)
    : []
  const jobTitles = experience.map((e) => e.title).filter(Boolean)

  return { skills, experience, jobTitles }
}

// ─── Preferences Loading ────────────────────────────────────────────────────

async function loadPreferences(): Promise<AdapterConfig['preferences']> {
  const db = getDb()
  const rows = await db.select().from(schema.preferencesTable).limit(1)
  const prefs = rows[0]

  return {
    targetTitles: Array.isArray(prefs?.targetTitles) ? prefs.targetTitles as string[] : [],
    locations: Array.isArray(prefs?.locations) ? prefs.locations as string[] : [],
    remotePreference: prefs?.remotePreference ?? null,
  }
}

// ─── Embedding Step ─────────────────────────────────────────────────────────

async function embedJobs(jobs: NormalizedJob[]): Promise<void> {
  for (const job of jobs) {
    const text = `${job.title} ${job.company} ${job.descriptionText.slice(0, 500)}`
    const embeddingFloat32 = await computeEmbedding(text)
    job.embedding = Array.from(embeddingFloat32)
  }
}

// ─── DB Insert (new jobs only — called AFTER dedup) ─────────────────────────

async function insertNewJobs(jobs: NormalizedJob[]): Promise<void> {
  if (jobs.length === 0) return
  const db = getDb()

  for (const job of jobs) {
    await db
      .insert(schema.jobsTable)
      .values({
        externalId: job.externalId,
        sourceName: job.sourceName,
        title: job.title,
        company: job.company,
        descriptionHtml: job.descriptionHtml ?? null,
        descriptionText: job.descriptionText,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        location: job.location ?? null,
        isRemote: job.isRemote ?? false,
        sourceUrl: job.sourceUrl,
        applyUrl: job.applyUrl ?? null,
        benefits: job.benefits ?? null,
        rawData: job.rawData,
        embedding: job.embedding ?? null,
        sources: job.sources,
        pipelineStage: job.pipelineStage,
        discoveredAt: job.discoveredAt,
        searchVector: sql`to_tsvector('english', ${job.searchText})`,
      })
      .onConflictDoNothing({
        target: [schema.jobsTable.sourceName, schema.jobsTable.externalId],
      })
  }
}

// ─── Score and Update ───────────────────────────────────────────────────────

async function scoreAndUpdateJobs(jobs: NormalizedJob[], resume: ParsedResume): Promise<void> {
  const db = getDb()
  const BATCH_SIZE = 5

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (job) => {
        const { matchScore, matchBreakdown } = await scoreJob(job, resume)
        await db
          .update(schema.jobsTable)
          .set({ matchScore, matchBreakdown })
          .where(
            and(
              eq(schema.jobsTable.sourceName, job.sourceName),
              eq(schema.jobsTable.externalId, job.externalId),
            ),
          )
      }),
    )
  }
}

// ─── Pipeline Run Updates ───────────────────────────────────────────────────

const COUNTER_COLUMNS = {
  sourcesAttempted: schema.pipelineRunsTable.sourcesAttempted,
  sourcesSucceeded: schema.pipelineRunsTable.sourcesSucceeded,
  sourcesFailed: schema.pipelineRunsTable.sourcesFailed,
  listingsFetched: schema.pipelineRunsTable.listingsFetched,
  listingsNew: schema.pipelineRunsTable.listingsNew,
  listingsDeduplicated: schema.pipelineRunsTable.listingsDeduplicated,
} as const

type CounterKey = keyof typeof COUNTER_COLUMNS

async function incrementRunCounters(
  runId: string,
  counters: Partial<Record<CounterKey, number>>,
): Promise<void> {
  const db = getDb()
  const setClauses: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(counters)) {
    const col = COUNTER_COLUMNS[key as CounterKey]
    if (col) {
      setClauses[key] = sql`COALESCE(${col}, 0) + ${value}`
    }
  }

  if (Object.keys(setClauses).length > 0) {
    await db
      .update(schema.pipelineRunsTable)
      .set(setClauses)
      .where(eq(schema.pipelineRunsTable.id, runId))
  }
}

async function appendRunError(runId: string, error: SourceError): Promise<void> {
  const db = getDb()
  await db
    .update(schema.pipelineRunsTable)
    .set({
      errors: sql`COALESCE(${schema.pipelineRunsTable.errors}, '[]'::jsonb) || ${JSON.stringify([error])}::jsonb`,
    })
    .where(eq(schema.pipelineRunsTable.id, runId))
}

async function completeRun(runId: string): Promise<void> {
  const db = getDb()
  await db
    .update(schema.pipelineRunsTable)
    .set({ completedAt: new Date() })
    .where(eq(schema.pipelineRunsTable.id, runId))
}

// ─── Source Health Updates ───────────────────────────────────────────────────

async function updateSourceHealth(
  sourceName: string,
  success: boolean,
  error?: string,
): Promise<void> {
  const db = getDb()

  if (success) {
    await db
      .update(schema.sourcesTable)
      .set({
        healthStatus: 'healthy',
        lastFetchAt: new Date(),
        consecutiveErrors: 0,
        updatedAt: new Date(),
      })
      .where(eq(schema.sourcesTable.name, sourceName))
  } else {
    await db
      .update(schema.sourcesTable)
      .set({
        healthStatus: 'error',
        lastError: { message: error, timestamp: new Date().toISOString() },
        consecutiveErrors: sql`${schema.sourcesTable.consecutiveErrors} + 1`,
        errorCount: sql`${schema.sourcesTable.errorCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.sourcesTable.name, sourceName))
  }
}

// ─── Process Single Source ──────────────────────────────────────────────────

async function processSource(
  adapter: SourceAdapter,
  adapterConfig: AdapterConfig,
  resume: ParsedResume | null,
): Promise<{ fetched: number; newCount: number; deduplicated: number }> {
  // 1. Fetch
  log('info', 'pipeline.source.fetch.start', { source: adapter.name })
  const rawListings = await adapter.fetchListings(adapterConfig)
  log('info', 'pipeline.source.fetch.done', { source: adapter.name, count: rawListings.length })

  if (rawListings.length === 0) {
    return { fetched: 0, newCount: 0, deduplicated: 0 }
  }

  // 2. Normalize — skip expensive benefits extraction on re-fetches
  const db = getDb()
  const existingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.jobsTable)
    .where(eq(schema.jobsTable.sourceName, adapter.name))
    .then((rows) => rows[0]?.count ?? 0)

  const normalizeOpts: NormalizeOptions = existingCount > 0 ? { skipBenefits: true } : {}
  const { normalized } = await normalize(rawListings, normalizeOpts)
  log('info', 'pipeline.source.normalize.done', {
    source: adapter.name,
    count: normalized.length,
    skipBenefits: normalizeOpts.skipBenefits ?? false,
  })

  // 3. Embed (in-memory — populates job.embedding before dedup)
  await embedJobs(normalized)
  log('info', 'pipeline.source.embed.done', { source: adapter.name, count: normalized.length })

  // 4. Deduplicate (queries DB for existing records — BEFORE insert)
  const dedupDb = getDb() as unknown as Parameters<typeof deduplicate>[1]
  const dedupResult = await deduplicate(normalized, dedupDb)
  log('info', 'pipeline.source.dedup.done', {
    source: adapter.name,
    new: dedupResult.new.length,
    duplicates: dedupResult.duplicateCount,
  })

  // 5. Insert only NEW jobs into DB (dedup already updated existing records)
  await insertNewJobs(dedupResult.new)
  log('info', 'pipeline.source.insert.done', { source: adapter.name, count: dedupResult.new.length })

  // 6. Score only NEW jobs and updated jobs that lack a score
  if (resume) {
    const jobsToScore = dedupResult.new
    // For updated (duplicate) jobs, only re-score if they had no score before
    if (dedupResult.updatedNeedScore) {
      jobsToScore.push(...dedupResult.updatedNeedScore)
    }
    if (jobsToScore.length > 0) {
      await scoreAndUpdateJobs(jobsToScore, resume)
    }
    log('info', 'pipeline.source.score.done', {
      source: adapter.name,
      scored: jobsToScore.length,
      skippedAlreadyScored: dedupResult.updated.length - (dedupResult.updatedNeedScore?.length ?? 0),
    })
  }

  return {
    fetched: rawListings.length,
    newCount: dedupResult.new.length,
    deduplicated: dedupResult.duplicateCount,
  }
}

// ─── Main Discovery Processor ───────────────────────────────────────────────

export async function discoveryProcessor(job: Job<DiscoveryJobData>): Promise<void> {
  const { runId, sourceNames } = job.data
  log('info', 'pipeline.run.start', { runId, sources: sourceNames })

  // Load resume and preferences
  const [resume, preferences] = await Promise.all([
    loadResume(),
    loadPreferences(),
  ])

  if (!resume) {
    log('warn', 'pipeline.run.no-resume', { runId })
  }

  // Load enabled sources and get adapters
  const db = getDb()
  const allSources = await db.select().from(schema.sourcesTable)
  const enabledSources = allSources
    .filter((s) => s.isEnabled && sourceNames.includes(s.name))
    .map((s) => ({ name: s.name, isEnabled: true as boolean }))
  const adapters = getEnabledAdapters(enabledSources)

  // Process each source
  for (const adapter of adapters) {
    await incrementRunCounters(runId, { sourcesAttempted: 1 })

    try {
      // Build adapter config
      const apiKey = await getSourceApiKey(adapter.name)
      const adapterConfig: AdapterConfig = {
        apiKey: apiKey ?? undefined,
        preferences,
      }

      const stats = await processSource(adapter, adapterConfig, resume)

      await incrementRunCounters(runId, {
        sourcesSucceeded: 1,
        listingsFetched: stats.fetched,
        listingsNew: stats.newCount,
        listingsDeduplicated: stats.deduplicated,
      })

      await updateSourceHealth(adapter.name, true)
      log('info', 'pipeline.source.complete', { source: adapter.name, ...stats })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      log('error', 'pipeline.source.error', { source: adapter.name, error: errorMessage })

      await incrementRunCounters(runId, { sourcesFailed: 1 })
      await appendRunError(runId, {
        source: adapter.name,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      })
      await updateSourceHealth(adapter.name, false, errorMessage)

      // Continue processing other sources — no blocking
    }
  }

  // Complete the run
  await completeRun(runId)
  log('info', 'pipeline.run.complete', { runId })
}
