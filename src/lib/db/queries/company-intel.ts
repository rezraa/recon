import { eq } from 'drizzle-orm'

import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { CompanyIntel } from '@/lib/pipeline/company-intel'
import { normalizeCompanyName } from '@/lib/pipeline/company-intel'

export async function getCompanyIntelByName(companyName: string) {
  const db = getDb()
  const normalized = normalizeCompanyName(companyName)
  const rows = await db
    .select()
    .from(schema.companyIntelTable)
    .where(eq(schema.companyIntelTable.companyName, normalized))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertCompanyIntel(
  companyName: string,
  intel: CompanyIntel,
): Promise<void> {
  const db = getDb()
  const normalized = normalizeCompanyName(companyName)

  await db
    .insert(schema.companyIntelTable)
    .values({
      companyName: normalized,
      glassdoorRating: intel.glassdoorRating,
      companySize: intel.companySize,
      funding: intel.funding,
      industry: intel.industry,
      growth: intel.growth,
      recentNews: intel.recentNews,
      fetchedAt: intel.fetchedAt,
    })
    .onConflictDoUpdate({
      target: schema.companyIntelTable.companyName,
      set: {
        glassdoorRating: intel.glassdoorRating,
        companySize: intel.companySize,
        funding: intel.funding,
        industry: intel.industry,
        growth: intel.growth,
        recentNews: intel.recentNews,
        fetchedAt: intel.fetchedAt,
        updatedAt: new Date(),
      },
    })
}
