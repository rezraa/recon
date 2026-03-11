import type { Job } from 'bullmq'
import { and, eq } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import { getPreferences } from '@/lib/db/queries/preferences'
import { getResume, updateResumeExtraction } from '@/lib/db/queries/resume'
import * as schema from '@/lib/db/schema'
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

export interface RescoreJobData {
  resumeId: string
}

// ─── Rescore Processor ──────────────────────────────────────────────────────

const BATCH_SIZE = 5

export async function rescoreProcessor(job: Job<RescoreJobData>): Promise<void> {
  log('info', 'rescore.start', { resumeId: job.data.resumeId })

  const resumeRow = await getResume()
  if (!resumeRow) {
    throw new Error('No resume found — cannot rescore')
  }

  const skills = Array.isArray(resumeRow.skills) ? resumeRow.skills as string[] : []
  const experience = Array.isArray(resumeRow.experience)
    ? (resumeRow.experience as Array<{ title: string; company: string; years: number | null }>)
    : []

  // Get or create resume extraction
  let resumeProfile = resumeRow.resumeExtraction as ProfileExtraction | null
  if (!resumeProfile || !resumeProfile.hardSkills || resumeProfile.hardSkills.length === 0) {
    log('info', 'rescore.extract-resume', { reason: 'no cached extraction' })
    resumeProfile = await extractResumeProfile(skills, experience)
    await updateResumeExtraction(resumeProfile)
  }

  const resumeEmbeddings: EmbeddedProfile = await embedProfile(resumeProfile)

  // Load salary target from preferences
  const prefs = await getPreferences()
  const salaryTarget = prefs?.salaryMin
    ? (prefs.salaryMax ? Math.round((prefs.salaryMin + prefs.salaryMax) / 2) : prefs.salaryMin)
    : null

  const db = getDb()
  const allJobs = await db.select().from(schema.jobsTable)

  log('info', 'rescore.jobs-found', { count: allJobs.length })

  for (let i = 0; i < allJobs.length; i += BATCH_SIZE) {
    const batch = allJobs.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (dbJob) => {
        const normalizedJob: NormalizedJob = {
          externalId: dbJob.externalId,
          sourceName: dbJob.sourceName,
          title: dbJob.title ?? '',
          company: dbJob.company ?? '',
          descriptionText: dbJob.descriptionText ?? '',
          descriptionHtml: dbJob.descriptionHtml ?? undefined,
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

        // Pass cached extracted profile to avoid re-extraction via LLM
        const cachedProfile = dbJob.extractedProfile as ProfileExtraction | null
        const { matchScore, matchBreakdown, extractedProfile } = await scoreJob(
          normalizedJob, resumeProfile, resumeEmbeddings, salaryTarget, cachedProfile,
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
              eq(schema.jobsTable.sourceName, dbJob.sourceName),
              eq(schema.jobsTable.externalId, dbJob.externalId),
            ),
          )
      }),
    )

    const failures = results.filter((r) => r.status === 'rejected')
    for (const f of failures) {
      log('error', 'rescore.job-failed', {
        error: (f as PromiseRejectedResult).reason?.message ?? String((f as PromiseRejectedResult).reason),
      })
    }

    const progress = Math.round(((i + batch.length) / allJobs.length) * 100)
    await job.updateProgress(progress)
  }

  log('info', 'rescore.complete', { scored: allJobs.length })
}
