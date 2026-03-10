/**
 * Backfill embeddings for jobs with embedding = NULL.
 *
 * Core logic lives here (under src/) so tests can import it cleanly.
 * The CLI entry point is at scripts/backfill-embeddings.ts.
 */

import { eq, isNull } from 'drizzle-orm'

import { computeEmbedding } from '@/lib/ai/embeddings'
import { getDb } from '@/lib/db/client'
import { jobsTable } from '@/lib/db/schema'

const BATCH_SIZE = 5

export async function backfillEmbeddings(): Promise<{ total: number; updated: number; errors: number }> {
  const db = getDb()

  // Fetch all jobs with NULL embeddings
  const jobsWithoutEmbeddings = await db
    .select({
      id: jobsTable.id,
      title: jobsTable.title,
      company: jobsTable.company,
      descriptionText: jobsTable.descriptionText,
    })
    .from(jobsTable)
    .where(isNull(jobsTable.embedding))

  const total = jobsWithoutEmbeddings.length
  console.log(`Found ${total} jobs with NULL embeddings`)

  if (total === 0) {
    console.log('Nothing to backfill.')
    return { total: 0, updated: 0, errors: 0 }
  }

  let updated = 0
  let errors = 0

  // Process in batches
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = jobsWithoutEmbeddings.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(total / BATCH_SIZE)

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} jobs)...`)

    for (const job of batch) {
      try {
        // Match the text format used in embedJobs() from discovery.ts
        const text = `${job.title} ${job.company} ${job.descriptionText?.slice(0, 500) ?? ''}`
        const embeddingFloat32 = await computeEmbedding(text)
        const embedding = Array.from(embeddingFloat32)

        await db
          .update(jobsTable)
          .set({ embedding })
          .where(eq(jobsTable.id, job.id))

        updated++
      } catch (err) {
        console.error(`  Error embedding job ${job.id} (${job.title}):`, err)
        errors++
      }
    }
  }

  return { total, updated, errors }
}
