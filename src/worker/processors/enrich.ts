import type { Job } from 'bullmq'
import { and, eq, gt } from 'drizzle-orm'

import { fetchLinkedInDetail } from '@/lib/adapters/linkedin-detail'
import { getDb } from '@/lib/db/client'
import { getPreferences } from '@/lib/db/queries/preferences'
import { getResume, updateResumeExtraction } from '@/lib/db/queries/resume'
import * as schema from '@/lib/db/schema'
import {
  embedProfile,
  extractResumeProfile,
  scoreJob,
  type EmbeddedProfile,
  type ProfileExtraction,
} from '@/lib/pipeline/scoring'
import type { NormalizedJob } from '@/lib/pipeline/types'

import { log } from '../logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnrichJobData {
  jobId: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum time between enrichment attempts for the same job */
const ENRICHMENT_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

// ─── Enrichment Processor ───────────────────────────────────────────────────

export async function enrichProcessor(job: Job<EnrichJobData>): Promise<void> {
  const { jobId } = job.data
  log('info', 'enrich.start', { jobId })

  const db = getDb()

  // Load the job record
  const rows = await db
    .select()
    .from(schema.jobsTable)
    .where(eq(schema.jobsTable.id, jobId))
    .limit(1)

  const dbJob = rows[0]
  if (!dbJob) {
    log('warn', 'enrich.job-not-found', { jobId })
    return
  }

  // Guard: already enriched (partial=false)
  if (!dbJob.partial) {
    log('info', 'enrich.skip-already-enriched', { jobId })
    return
  }

  // Guard: recently attempted (within 1 hour)
  if (dbJob.enrichmentAttemptedAt) {
    const elapsed = Date.now() - dbJob.enrichmentAttemptedAt.getTime()
    if (elapsed < ENRICHMENT_COOLDOWN_MS) {
      log('info', 'enrich.skip-recently-attempted', {
        jobId,
        minutesAgo: Math.round(elapsed / 60000),
      })
      return
    }
  }

  // Record the attempt timestamp (before fetching, to prevent retry storms)
  await db
    .update(schema.jobsTable)
    .set({ enrichmentAttemptedAt: new Date() })
    .where(eq(schema.jobsTable.id, jobId))

  // Fetch the full description from LinkedIn
  const sourceUrl = dbJob.sourceUrl
  if (!sourceUrl) {
    log('warn', 'enrich.no-source-url', { jobId })
    return
  }

  const detail = await fetchLinkedInDetail(sourceUrl)
  if (!detail) {
    log('warn', 'enrich.fetch-failed', { jobId, sourceUrl })
    return
  }

  // Store the description
  await db
    .update(schema.jobsTable)
    .set({
      descriptionText: detail.descriptionText,
      descriptionHtml: detail.descriptionHtml,
    })
    .where(eq(schema.jobsTable.id, jobId))

  log('info', 'enrich.description-stored', { jobId, length: detail.descriptionText.length })

  // Re-score with full description
  const resumeRow = await getResume()
  if (!resumeRow) {
    log('warn', 'enrich.no-resume', { jobId })
    // Still mark as non-partial since we have the description now
    await db
      .update(schema.jobsTable)
      .set({ partial: false })
      .where(eq(schema.jobsTable.id, jobId))
    return
  }

  const skills = Array.isArray(resumeRow.skills) ? (resumeRow.skills as string[]) : []
  const experience = Array.isArray(resumeRow.experience)
    ? (resumeRow.experience as Array<{ title: string; company: string; years: number | null }>)
    : []

  // Get or create resume extraction
  let resumeProfile = resumeRow.resumeExtraction as ProfileExtraction | null
  if (!resumeProfile || !resumeProfile.hardSkills || resumeProfile.hardSkills.length === 0) {
    resumeProfile = await extractResumeProfile(skills, experience)
    await updateResumeExtraction(resumeProfile)
  }

  const resumeEmbeddings: EmbeddedProfile = await embedProfile(resumeProfile)

  // Load salary target
  const prefs = await getPreferences()
  const salaryTarget = prefs?.salaryMin
    ? (prefs.salaryMax ? Math.round((prefs.salaryMin + prefs.salaryMax) / 2) : prefs.salaryMin)
    : null

  // Build normalized job with enriched description
  const normalizedJob: NormalizedJob = {
    externalId: dbJob.externalId,
    sourceName: dbJob.sourceName,
    title: dbJob.title ?? '',
    company: dbJob.company ?? '',
    descriptionText: detail.descriptionText,
    descriptionHtml: detail.descriptionHtml,
    salaryMin: dbJob.salaryMin ?? undefined,
    salaryMax: dbJob.salaryMax ?? undefined,
    location: dbJob.location ?? undefined,
    isRemote: dbJob.isRemote ?? undefined,
    sourceUrl: dbJob.sourceUrl ?? '',
    applyUrl: undefined,
    benefits: undefined,
    rawData: {},
    country: dbJob.country ?? 'Unknown',
    fingerprint: '',
    searchText: '',
    sources: [],
    discoveredAt: dbJob.discoveredAt ?? new Date(),
    pipelineStage: dbJob.pipelineStage ?? 'discovered',
  }

  try {
    const { matchScore, matchBreakdown, extractedProfile } = await scoreJob(
      normalizedJob,
      resumeProfile,
      resumeEmbeddings,
      salaryTarget,
    )

    // Update: score + partial=false + extracted profile
    await db
      .update(schema.jobsTable)
      .set({
        matchScore,
        matchBreakdown,
        partial: false,
        extractedProfile: extractedProfile ?? null,
      })
      .where(eq(schema.jobsTable.id, jobId))

    log('info', 'enrich.complete', { jobId, matchScore })
  } catch (err) {
    // Score failed but description is stored — mark non-partial so user sees it
    log('error', 'enrich.score-failed', {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    })
    await db
      .update(schema.jobsTable)
      .set({ partial: false })
      .where(eq(schema.jobsTable.id, jobId))
  }
}
