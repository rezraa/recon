import { getDb } from '@/lib/db/client'
import { resumesTable } from '@/lib/db/schema'

type ResumeRow = typeof resumesTable.$inferSelect

export async function getResume(): Promise<ResumeRow | null> {
  const db = getDb()
  const results = await db.select().from(resumesTable).limit(1)
  return results[0] ?? null
}
