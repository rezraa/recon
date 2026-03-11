import { eq, sql } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import { resumesTable } from '@/lib/db/schema'

type ResumeRow = typeof resumesTable.$inferSelect

export async function getResume(): Promise<ResumeRow | null> {
  const db = getDb()
  const results = await db.select().from(resumesTable).limit(1)
  return results[0] ?? null
}

export async function upsertResume(data: {
  fileName: string
  parsedData: unknown
  skills: unknown
  experience: unknown
}): Promise<ResumeRow> {
  const db = getDb()

  return await db.transaction(async (tx) => {
    const existing = await tx.select().from(resumesTable).limit(1).then((r) => r[0] ?? null)

    if (existing) {
      const results = await tx
        .update(resumesTable)
        .set({
          fileName: data.fileName,
          parsedData: data.parsedData,
          skills: data.skills,
          experience: data.experience,
          updatedAt: sql`now()`,
        })
        .where(eq(resumesTable.id, existing.id))
        .returning()
      return results[0]
    }

    const results = await tx
      .insert(resumesTable)
      .values({
        fileName: data.fileName,
        parsedData: data.parsedData,
        skills: data.skills,
        experience: data.experience,
      })
      .returning()
    return results[0]
  })
}

export async function updateResumeParsedData(data: {
  parsedData: unknown
  skills: unknown
  experience: unknown
}): Promise<ResumeRow | null> {
  const db = getDb()
  const existing = await getResume()

  if (!existing) return null

  const results = await db
    .update(resumesTable)
    .set({
      parsedData: data.parsedData,
      skills: data.skills,
      experience: data.experience,
      resumeExtraction: null, // clear cached extraction on re-parse
      updatedAt: sql`now()`,
    })
    .where(eq(resumesTable.id, existing.id))
    .returning()
  return results[0]
}

export async function updateResumeExtraction(extraction: unknown): Promise<void> {
  const db = getDb()
  const existing = await getResume()
  if (!existing) return

  await db
    .update(resumesTable)
    .set({
      resumeExtraction: extraction,
      updatedAt: sql`now()`,
    })
    .where(eq(resumesTable.id, existing.id))
}
