import { eq, sql } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import { preferencesTable } from '@/lib/db/schema'

type PreferencesRow = typeof preferencesTable.$inferSelect

export async function getPreferences(): Promise<PreferencesRow | null> {
  const db = getDb()
  const results = await db.select().from(preferencesTable).limit(1)
  return results[0] ?? null
}

export async function upsertPreferences(data: {
  targetTitles: string[]
  salaryMin: number | null | undefined
  salaryMax: number | null | undefined
  locations: string[]
  remotePreference: string
}): Promise<PreferencesRow> {
  const db = getDb()

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(preferencesTable)
      .limit(1)
      .then((r) => r[0] ?? null)

    if (existing) {
      const results = await tx
        .update(preferencesTable)
        .set({
          targetTitles: data.targetTitles,
          salaryMin: data.salaryMin ?? null,
          salaryMax: data.salaryMax ?? null,
          locations: data.locations,
          remotePreference: data.remotePreference,
          updatedAt: sql`now()`,
        })
        .where(eq(preferencesTable.id, existing.id))
        .returning()
      return results[0]
    }

    const results = await tx
      .insert(preferencesTable)
      .values({
        targetTitles: data.targetTitles,
        salaryMin: data.salaryMin ?? null,
        salaryMax: data.salaryMax ?? null,
        locations: data.locations,
        remotePreference: data.remotePreference,
      })
      .returning()
    return results[0]
  })
}
