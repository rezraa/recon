import { eq, sql } from 'drizzle-orm'

import { getSourceByName } from '@/lib/adapters/registry'
import { getConfig } from '@/lib/config'
import { getDb } from '@/lib/db/client'
import { sourcesTable } from '@/lib/db/schema'
import { decrypt } from '@/lib/encryption'

type SourceRow = typeof sourcesTable.$inferSelect

export async function findAllSources(): Promise<SourceRow[]> {
  const db = getDb()
  return await db.select().from(sourcesTable)
}

export async function upsertSourceConfig(
  sourceName: string,
  encryptedConfig: Record<string, unknown>,
): Promise<SourceRow> {
  const db = getDb()

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(sourcesTable)
      .where(eq(sourcesTable.name, sourceName))
      .limit(1)
      .then((r) => r[0] ?? null)

    if (existing) {
      const results = await tx
        .update(sourcesTable)
        .set({
          config: encryptedConfig,
          updatedAt: sql`now()`,
        })
        .where(eq(sourcesTable.id, existing.id))
        .returning()
      return results[0]
    }

    const sourceConfig = getSourceByName(sourceName)

    const results = await tx
      .insert(sourcesTable)
      .values({
        name: sourceName,
        displayName: sourceConfig?.displayName ?? sourceName,
        type: sourceConfig?.type ?? 'key_required',
        config: encryptedConfig,
      })
      .returning()
    return results[0]
  })
}

export async function getSourceApiKey(sourceName: string): Promise<string | null> {
  const db = getDb()
  const results = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.name, sourceName))
    .limit(1)

  const source = results[0]
  if (!source?.config) return null

  const config = source.config as Record<string, string>
  if (!config.apiKey) return null

  const { ENCRYPTION_KEY } = getConfig()
  return decrypt(config.apiKey, ENCRYPTION_KEY)
}
