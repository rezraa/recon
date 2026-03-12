import type { Job } from 'bullmq'
import { and, eq, sql } from 'drizzle-orm'

import { SOURCE_CONFIGS } from '@/lib/adapters/constants'
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
import type { MatchBreakdown, NormalizedJob } from '@/lib/pipeline/types'

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

/**
 * Get the most recent job title from the resume to use as a search term.
 * Passed directly to job board APIs — they handle fuzzy matching.
 */
function getResumeSearchTitle(jobTitles: string[]): string | null {
  if (jobTitles.length === 0) return null
  const title = jobTitles[0].trim()
  return title.length >= 3 ? title : null
}

async function loadPreferences(): Promise<AdapterConfig['preferences']> {
  const db = getDb()
  const rows = await db.select().from(schema.preferencesTable).limit(1)
  const prefs = rows[0]

  let targetTitles = Array.isArray(prefs?.targetTitles) ? prefs.targetTitles as string[] : []

  let locations = Array.isArray(prefs?.locations) ? prefs.locations as string[] : []

  // If no targetTitles or locations set by user, derive from resume
  if (targetTitles.length === 0 || locations.length === 0) {
    const resumeRow = await getResume()
    if (resumeRow) {
      const parsedData = resumeRow.parsedData as { jobTitles?: string[]; location?: string } | null

      if (targetTitles.length === 0) {
        const jobTitles = Array.isArray(parsedData?.jobTitles) ? parsedData.jobTitles : []
        const derived = getResumeSearchTitle(jobTitles)
        if (derived) {
          targetTitles = [derived]
          log('info', 'pipeline.preferences.derived', { from: jobTitles[0], derived })
        }
      }

      if (locations.length === 0 && parsedData?.location) {
        locations = [parsedData.location]
        log('info', 'pipeline.preferences.location-from-resume', { location: parsedData.location })
      }
    }
  }

  return {
    targetTitles,
    locations,
    remotePreference: prefs?.remotePreference ?? null,
  }
}

// ─── Embedding Step ─────────────────────────────────────────────────────────

async function embedJobs(jobs: NormalizedJob[]): Promise<void> {
  for (const job of jobs) {
    const text = `${job.title} ${job.company} ${job.descriptionText.slice(0, 500)}`
    const embeddingFloat32 = await computeEmbedding(text)
    const embedding = Array.from(embeddingFloat32)

    // Guard against NaN/Infinity which pgvector rejects (error 22P02)
    if (embedding.some(v => !Number.isFinite(v))) {
      log('warn', 'pipeline.embed.bad-values', {
        title: job.title,
        company: job.company,
        hasNaN: embedding.some(v => Number.isNaN(v)),
        hasInfinity: embedding.some(v => !Number.isFinite(v)),
      })
      job.embedding = undefined
    } else {
      job.embedding = embedding
    }
  }
}

// ─── Score + Insert (batch of 5 — score sequentially, flush batch to DB) ─────

const SCORE_BATCH_SIZE = 5

interface ScoredJob {
  job: NormalizedJob
  matchScore: number
  matchBreakdown: MatchBreakdown
  extractedProfile?: ProfileExtraction
}

async function scoreAndInsertJobs(
  jobs: NormalizedJob[],
  resume: LoadedResume,
  salaryTarget: number | null,
): Promise<number> {
  if (jobs.length === 0) return 0
  const db = getDb()
  let insertFailures = 0

  for (let i = 0; i < jobs.length; i += SCORE_BATCH_SIZE) {
    const batch = jobs.slice(i, i + SCORE_BATCH_SIZE)

    // Score sequentially (one LLM call at a time)
    const scored: ScoredJob[] = []
    for (const job of batch) {
      const { matchScore, matchBreakdown, extractedProfile } = await scoreJob(
        job, resume.profile, resume.embeddings, salaryTarget,
      )
      scored.push({ job, matchScore, matchBreakdown, extractedProfile })
    }

    // Flush batch to DB (skip individual failures so one bad row doesn't kill the run)
    for (const { job, matchScore, matchBreakdown, extractedProfile } of scored) {
      try {
        await db
          .insert(schema.jobsTable)
          .values({
            externalId: job.externalId,
            sourceName: job.sourceName,
            title: job.title,
            company: job.company,
            descriptionHtml: job.descriptionHtml ?? null,
            descriptionText: job.descriptionText,
            salaryMin: job.salaryMin != null ? Math.round(job.salaryMin) : null,
            salaryMax: job.salaryMax != null ? Math.round(job.salaryMax) : null,
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
            matchScore,
            matchBreakdown,
            extractedProfile: extractedProfile ?? null,
          })
          .onConflictDoNothing({
            target: [schema.jobsTable.sourceName, schema.jobsTable.externalId],
          })
      } catch (err) {
        // Dig through error chain to find the actual Postgres error
        const outer = err as Record<string, unknown>
        const cause = (outer.cause ?? outer.original ?? outer.error) as Record<string, unknown> | undefined
        const pgCode = outer.code ?? cause?.code
        const pgDetail = outer.detail ?? cause?.detail
        const pgConstraint = outer.constraint ?? cause?.constraint
        const pgSeverity = outer.severity ?? cause?.severity
        const pgHint = outer.hint ?? cause?.hint

        // Extract error message without the SQL dump
        const rawMsg = String(outer.message ?? err)
        const queryIdx = rawMsg.indexOf('Failed query:')
        const errorPart = queryIdx > 0 ? rawMsg.slice(0, queryIdx).trim() : ''
        // Also check for message after the query (some drivers put it there)
        const afterQuery = queryIdx >= 0 ? rawMsg.slice(queryIdx + 200).trim().slice(0, 200) : ''

        // Check embedding for bad values
        const embeddingIssues = job.embedding
          ? {
              hasNaN: job.embedding.some(v => Number.isNaN(v)),
              hasInfinity: job.embedding.some(v => !Number.isFinite(v)),
              sample: job.embedding.slice(0, 5),
              min: Math.min(...job.embedding),
              max: Math.max(...job.embedding),
            }
          : null

        log('error', 'pipeline.insert.failed', {
          jobId: job.externalId,
          source: job.sourceName,
          title: job.title,
          company: job.company,
          pgCode,
          pgDetail,
          pgConstraint,
          pgSeverity,
          pgHint,
          causeMessage: cause ? String(cause.message ?? cause.name ?? '') : undefined,
          causeRoutine: cause?.routine,
          causeWhere: cause?.where,
          causeLine: cause?.line,
          causeFile: cause?.file,
          descriptionLength: job.descriptionText?.length,
          searchTextLength: job.searchText?.length,
          embeddingLength: job.embedding?.length,
          embeddingIssues,
        })
        insertFailures++
      }
    }
  }
  if (insertFailures > 0) {
    log('warn', 'pipeline.insert.failures', { total: jobs.length, failed: insertFailures })
  }
  return jobs.length - insertFailures
}

// ─── Insert unscored jobs (no resume available) ─────────────────────────────

async function insertUnscoredJobs(jobs: NormalizedJob[]): Promise<void> {
  if (jobs.length === 0) return
  const db = getDb()

  for (const job of jobs) {
    try {
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
    } catch (err) {
      const pgError = err as { code?: string; detail?: string; constraint?: string; column?: string; message?: string }
      const rawMsg = pgError.message ?? String(err)
      const shortMsg = rawMsg.includes('Failed query:')
        ? rawMsg.slice(0, rawMsg.indexOf('Failed query:')).trim() || rawMsg.slice(0, 200)
        : rawMsg.slice(0, 200)
      log('error', 'pipeline.insert.failed', {
        jobId: job.externalId,
        source: job.sourceName,
        title: job.title,
        pgCode: pgError.code,
        pgDetail: pgError.detail,
        pgConstraint: pgError.constraint,
        pgColumn: pgError.column,
        error: shortMsg,
        searchTextLength: job.searchText?.length,
      })
    }
  }
}

// ─── Score + Update existing jobs (dedup matches needing score) ──────────────

async function scoreAndUpdateExistingJobs(
  jobs: NormalizedJob[],
  resume: LoadedResume,
  salaryTarget: number | null,
): Promise<number> {
  if (jobs.length === 0) return 0
  const db = getDb()

  for (const job of jobs) {
    const { matchScore, matchBreakdown, extractedProfile } = await scoreJob(
      job, resume.profile, resume.embeddings, salaryTarget,
    )
    await db
      .update(schema.jobsTable)
      .set({
        matchScore,
        matchBreakdown,
        extractedProfile: extractedProfile ?? null,
      })
      .where(
        and(
          eq(schema.jobsTable.sourceName, job.sourceName),
          eq(schema.jobsTable.externalId, job.externalId),
        ),
      )
  }
  return jobs.length
}

// ─── Salary Target ──────────────────────────────────────────────────────────

async function loadSalaryTarget(): Promise<number | null> {
  const prefs = await getPreferences()
  if (!prefs?.salaryMin) return null
  return prefs.salaryMax
    ? Math.round((prefs.salaryMin + prefs.salaryMax) / 2)
    : prefs.salaryMin
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

// ─── Cache check: skip listings already in DB ───────────────────────────────

const PRE_FILTER_BATCH_SIZE = 500

async function filterKnownListings(
  fetches: FetchResult[],
): Promise<{ filtered: FetchResult[]; cacheHits: number }> {
  const db = getDb()

  // Collect all (source_name, external_id) pairs across all fetches
  const allPairs: Array<{ source: string; externalId: string }> = []
  for (const { listings } of fetches) {
    for (const listing of listings) {
      allPairs.push({ source: listing.source_name, externalId: listing.external_id })
    }
  }

  if (allPairs.length === 0) return { filtered: fetches, cacheHits: 0 }

  // Batch query DB for existing external_ids (chunked to avoid huge IN clauses)
  const existingSet = new Set<string>()

  for (let i = 0; i < allPairs.length; i += PRE_FILTER_BATCH_SIZE) {
    const batch = allPairs.slice(i, i + PRE_FILTER_BATCH_SIZE)

    // Build OR conditions for this batch
    const conditions = batch.map(
      (p) => sql`(${schema.jobsTable.sourceName} = ${p.source} AND ${schema.jobsTable.externalId} = ${p.externalId})`,
    )

    const rows = await db
      .select({
        sourceName: schema.jobsTable.sourceName,
        externalId: schema.jobsTable.externalId,
        closedAt: schema.jobsTable.closedAt,
      })
      .from(schema.jobsTable)
      .where(sql.join(conditions, sql` OR `))

    for (const row of rows) {
      // Don't skip closed jobs — let them through so they can be re-opened
      if (row.closedAt) continue
      existingSet.add(`${row.sourceName}::${row.externalId}`)
    }
  }

  if (existingSet.size === 0) return { filtered: fetches, cacheHits: 0 }

  // Filter out known listings from each fetch result
  let cacheHits = 0
  const filtered: FetchResult[] = []

  for (const fetch of fetches) {
    const newListings = fetch.listings.filter((listing) => {
      const key = `${listing.source_name}::${listing.external_id}`
      if (existingSet.has(key)) {
        cacheHits++
        return false
      }
      return true
    })
    filtered.push({ source: fetch.source, listings: newListings })
  }

  return { filtered, cacheHits }
}

// ─── Phase 2: Normalize, embed, dedup, score, insert ────────────────────────

async function processAllJobs(
  fetches: FetchResult[],
  resume: LoadedResume | null,
  salaryTarget: number | null,
  runId: string,
): Promise<void> {
  // Cache check: skip listings already in DB (saves normalize + embed work)
  const totalFetched = fetches.reduce((sum, f) => sum + f.listings.length, 0)
  const { filtered: freshFetches, cacheHits } = await filterKnownListings(fetches)
  const totalAfterFilter = freshFetches.reduce((sum, f) => sum + f.listings.length, 0)

  log('info', 'pipeline.cacheCheck.done', {
    totalFetched,
    cacheHits,
    newToProcess: totalAfterFilter,
  })

  // Normalize and embed each source's listings sequentially (CPU-bound)
  const allNormalized: NormalizedJob[] = []

  for (const { source, listings } of freshFetches) {
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

  // Score + insert new jobs one at a time (each appears in feed immediately)
  if (resume && dedupResult.new.length > 0) {
    log('info', 'pipeline.score.start', { count: dedupResult.new.length })
    const count = await scoreAndInsertJobs(dedupResult.new, resume, salaryTarget)
    log('info', 'pipeline.insert.done', { count, scored: true })
  } else {
    await insertUnscoredJobs(dedupResult.new)
    log('info', 'pipeline.insert.done', { count: dedupResult.new.length, scored: false })
  }

  // Update run counters (cache hits = same source/id, dedup = cross-source matches)
  await incrementRunCounters(runId, {
    listingsNew: dedupResult.new.length,
    listingsDeduplicated: cacheHits + dedupResult.duplicateCount,
  })

  // Score + update existing dedup matches that had no score (already in DB)
  if (resume && dedupResult.updatedNeedScore && dedupResult.updatedNeedScore.length > 0) {
    log('info', 'pipeline.score.existing', { count: dedupResult.updatedNeedScore.length })
    const count = await scoreAndUpdateExistingJobs(dedupResult.updatedNeedScore, resume, salaryTarget)
    log('info', 'pipeline.score.done', {
      newScored: dedupResult.new.length,
      existingScored: count,
      skippedAlreadyScored: dedupResult.updated.length - dedupResult.updatedNeedScore.length,
    })
  }
}

// ─── Mark closed jobs ───────────────────────────────────────────────────────

/**
 * ATS adapters return the complete set of active jobs per source.
 * If a job was in our DB but is no longer in the API response,
 * the posting has been removed (filled/closed).
 *
 * Only applies to sources that return complete listings — not RSS,
 * search engines, or aggregators that return partial results.
 */
const COMPLETE_LISTING_SOURCES = new Set(['greenhouse', 'ashby', 'lever', 'smartrecruiters'])

async function markClosedJobs(fetches: FetchResult[]): Promise<void> {
  const db = getDb()

  for (const { source, listings } of fetches) {
    if (!COMPLETE_LISTING_SOURCES.has(source)) continue
    if (listings.length === 0) continue // empty fetch = possible error, don't mark everything closed

    // Collect all external_ids from the fresh fetch
    const freshIds = new Set(listings.map((l) => l.external_id))

    // Get all active (non-closed) jobs from this source in DB
    const dbJobs = await db
      .select({
        id: schema.jobsTable.id,
        externalId: schema.jobsTable.externalId,
      })
      .from(schema.jobsTable)
      .where(
        and(
          eq(schema.jobsTable.sourceName, source),
          sql`${schema.jobsTable.closedAt} IS NULL`,
        ),
      )

    // Any DB job not in the fresh set → mark as closed
    const closedIds: string[] = []
    for (const dbJob of dbJobs) {
      if (!freshIds.has(dbJob.externalId)) {
        closedIds.push(dbJob.id)
      }
    }

    if (closedIds.length > 0) {
      await db
        .update(schema.jobsTable)
        .set({ closedAt: new Date(), updatedAt: new Date() })
        .where(sql`${schema.jobsTable.id} = ANY(ARRAY[${sql.join(closedIds.map(id => sql`${id}::uuid`), sql`,`)}])`)

      log('info', 'pipeline.closedJobs', {
        source,
        closed: closedIds.length,
        active: dbJobs.length - closedIds.length,
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
    .filter((a) => SOURCE_CONFIGS[a.name]?.mode === 'feed')

  // Phase 1: Fetch all sources in parallel (network I/O only)
  const fetches = await fetchAllSources(adapters, preferences, runId)
  log('info', 'pipeline.fetch.allDone', {
    succeeded: fetches.length,
    failed: adapters.length - fetches.length,
    totalListings: fetches.reduce((sum, f) => sum + f.listings.length, 0),
  })

  // Phase 1.5: Mark jobs as closed if they disappeared from complete-listing sources
  await markClosedJobs(fetches)

  // Phase 2: Normalize → embed → dedup → insert → score (sequential, one pass)
  await processAllJobs(fetches, resume, salaryTarget, runId)

  // Complete the run
  await completeRun(runId)
  log('info', 'pipeline.run.complete', { runId })
}
