import { eq, isNull } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import { jobsTable } from '@/lib/db/schema'

import { extractCountry } from './location'

const BATCH_SIZE = 500

export interface BackfillResult {
  updated: number
}

/**
 * Backfill country column for existing jobs that have NULL country.
 * Idempotent — only processes jobs where country IS NULL.
 * Processes in batches of 500 to avoid loading all jobs into memory.
 */
export async function backfillCountry(): Promise<BackfillResult> {
  const db = getDb()
  let totalUpdated = 0

  // Process in batches
  while (true) {
    const batch = await db
      .select({
        id: jobsTable.id,
        location: jobsTable.location,
      })
      .from(jobsTable)
      .where(isNull(jobsTable.country))
      .limit(BATCH_SIZE)

    if (batch.length === 0) break

    for (const job of batch) {
      const country = extractCountry(job.location)
      await db
        .update(jobsTable)
        .set({ country })
        .where(eq(jobsTable.id, job.id))
    }

    totalUpdated += batch.length
  }

  return { updated: totalUpdated }
}
