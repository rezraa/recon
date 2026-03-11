import type { Job } from 'bullmq'
import { and, eq, sql } from 'drizzle-orm'

import { getEnabledAdapters } from '@/lib/adapters/registry'
import type { AdapterConfig, SourceAdapter } from '@/lib/adapters/types'
import { computeEmbedding } from '@/lib/ai/embeddings'
import { getDb } from '@/lib/db/client'
import { getPreferences } from '@/lib/db/queries/preferences'
import { getResume, updateResumeExtraction } from '@/lib/db/queries/resume'
import { getSourceApiKey } from '@/lib/db/queries/sources'
import * as schema from '@/lib/db/schema'
import { deduplicate } from '@/lib/pipeline/deduplicator'
import { normalize } from '@/lib/pipeline/normalizer'
import {
  scoreJob,
  extractResumeProfile,
  embedProfile,
  type ProfileExtraction,
  type EmbeddedProfile,
} from '@/lib/pipeline/scoring'
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

interface FetchResult {
  source: string
  listings: Awaited<ReturnType<SourceAdapter['fetchListings']>>
}

// ─── Resume Loading ─────────────────────────────────────────────────────────

interface LoadedResume {
  profile: ProfileExtraction
  embeddings: EmbeddedProfile
}

async function loadResumeForScoring(): Promise<LoadedResume | null> {
  const resumeRow = await getResume()
  if (!resumeRow) return null

  const skills = Array.isArray(resumeRow.skills) ? resumeRow.skills as string[] : []
  const experience = Array.isArray(resumeRow.experience)
    ? (resumeRow.experience as Array<{ title: string; company: string; years: number | null }>)
    : []

  if (skills.length === 0 && experience.length === 0) return null

  // Check for cached extraction
  let profile = resumeRow.resumeExtraction as ProfileExtraction | null
  if (!profile || !profile.hardSkills || profile.hardSkills.length === 0) {
    log('info', 'pipeline.resume.extract', { reason: 'no cached extraction' })
    profile = await extractResumeProfile(skills, experience)
    await updateResumeExtraction(profile)
    log('info', 'pipeline.resume.extract.done', {
      hardSkills: profile.hardSkills.length,
      title: profile.title,
    })
  }

  const embeddings = await embedProfile(profile)

  return { profile, embeddings }
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
        country: job.country,
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

async function loadSalaryTarget(): Promise<number | null> {
  const prefs = await getPreferences()
  if (!prefs?.salaryMin) return null
  return prefs.salaryMax
    ? Math.round((prefs.salaryMin + prefs.salaryMax) / 2)
    : prefs.salaryMin
}

async function scoreAndUpdateJobs(
  jobs: NormalizedJob[],
  resume: LoadedResume,
  salaryTarget: number | null,
): Promise<void> {
  const db = getDb()
  const BATCH_SIZE = 5

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (job) => {
        const { matchScore, matchBreakdown, extractedProfile } = await scoreJob(
          job, resume.profile, resume.embeddings, salaryTarget,
        )
        await db
          .update(schema.jobsTable)
          .set({
            matchScore,
            matchBreakdown,
            ...(extractedProfile ? { extractedProfile } : {}),
          })
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

// ─── Phase 1: Fetch all sources in parallel ─────────────────────────────────

async function fetchAllSources(
  adapters: SourceAdapter[],
  preferences: AdapterConfig['preferences'],
  runId: string,
): Promise<FetchResult[]> {
  // Set sourcesAttempted to total count up front
  await incrementRunCounters(runId, { sourcesAttempted: adapters.length })

  // Fire all fetches in parallel
  const results = await Promise.allSettled(
    adapters.map(async (adapter): Promise<FetchResult> => {
      const apiKey = await getSourceApiKey(adapter.name)
      const adapterConfig: AdapterConfig = {
        apiKey: apiKey ?? undefined,
        preferences,
      }

      log('info', 'pipeline.source.fetch.start', { source: adapter.name })
      const listings = await adapter.fetchListings(adapterConfig)
      log('info', 'pipeline.source.fetch.done', { source: adapter.name, count: listings.length })

      return { source: adapter.name, listings }
    }),
  )

  // Process results — update counters and health per source
  const successfulFetches: FetchResult[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const adapter = adapters[i]

    if (result.status === 'fulfilled') {
      await incrementRunCounters(runId, {
        sourcesSucceeded: 1,
        listingsFetched: result.value.listings.length,
      })
      await updateSourceHealth(adapter.name, true)
      successfulFetches.push(result.value)
    } else {
      const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason)
      log('error', 'pipeline.source.error', { source: adapter.name, error: errorMessage })

      await incrementRunCounters(runId, { sourcesFailed: 1 })
      await appendRunError(runId, {
        source: adapter.name,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      })
      await updateSourceHealth(adapter.name, false, errorMessage)
    }
  }

  return successfulFetches
}

// ─── Phase 2: Normalize, embed, dedup, insert, score ────────────────────────

async function processAllJobs(
  fetches: FetchResult[],
  resume: LoadedResume | null,
  salaryTarget: number | null,
  runId: string,
): Promise<void> {
  // Normalize and embed each source's listings sequentially (CPU-bound)
  const allNormalized: NormalizedJob[] = []

  for (const { source, listings } of fetches) {
    if (listings.length === 0) continue

    const { normalized } = await normalize(listings)
    log('info', 'pipeline.source.normalize.done', {
      source,
      count: normalized.length,
    })

    await embedJobs(normalized)
    log('info', 'pipeline.source.embed.done', { source, count: normalized.length })

    allNormalized.push(...normalized)
  }

  if (allNormalized.length === 0) {
    log('info', 'pipeline.process.skip', { reason: 'no jobs to process' })
    return
  }

  log('info', 'pipeline.process.start', { totalJobs: allNormalized.length })

  // Single dedup pass across all sources
  const dedupDb = getDb() as unknown as Parameters<typeof deduplicate>[1]
  const dedupResult = await deduplicate(allNormalized, dedupDb)
  log('info', 'pipeline.dedup.done', {
    new: dedupResult.new.length,
    duplicates: dedupResult.duplicateCount,
  })

  // Single insert pass
  await insertNewJobs(dedupResult.new)
  log('info', 'pipeline.insert.done', { count: dedupResult.new.length })

  // Update run counters for dedup/insert
  await incrementRunCounters(runId, {
    listingsNew: dedupResult.new.length,
    listingsDeduplicated: dedupResult.duplicateCount,
  })

  // Single scoring pass — all new jobs + unscored duplicates
  if (resume) {
    const jobsToScore = [...dedupResult.new]
    if (dedupResult.updatedNeedScore) {
      jobsToScore.push(...dedupResult.updatedNeedScore)
    }
    if (jobsToScore.length > 0) {
      log('info', 'pipeline.score.start', { count: jobsToScore.length })
      await scoreAndUpdateJobs(jobsToScore, resume, salaryTarget)
      log('info', 'pipeline.score.done', {
        scored: jobsToScore.length,
        skippedAlreadyScored: dedupResult.updated.length - (dedupResult.updatedNeedScore?.length ?? 0),
      })
    }
  }
}

// ─── Main Discovery Processor ───────────────────────────────────────────────

export async function discoveryProcessor(job: Job<DiscoveryJobData>): Promise<void> {
  const { runId, sourceNames } = job.data
  log('info', 'pipeline.run.start', { runId, sources: sourceNames })

  // Load resume, preferences, and salary target
  const [resume, preferences, salaryTarget] = await Promise.all([
    loadResumeForScoring(),
    loadPreferences(),
    loadSalaryTarget(),
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

  // Phase 1: Fetch all sources in parallel (network I/O only)
  const fetches = await fetchAllSources(adapters, preferences, runId)
  log('info', 'pipeline.fetch.allDone', {
    succeeded: fetches.length,
    failed: adapters.length - fetches.length,
    totalListings: fetches.reduce((sum, f) => sum + f.listings.length, 0),
  })

  // Phase 2: Normalize → embed → dedup → insert → score (sequential, one pass)
  await processAllJobs(fetches, resume, salaryTarget, runId)

  // Complete the run
  await completeRun(runId)
  log('info', 'pipeline.run.complete', { runId })
}
