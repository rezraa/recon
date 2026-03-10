import { count, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { jobsTable } from '@/lib/db/schema'

export async function GET() {
  try {
    const db = getDb()

    const results = await db
      .select({
        code: jobsTable.country,
        count: count(),
      })
      .from(jobsTable)
      .where(eq(jobsTable.isDismissed, false))
      .groupBy(jobsTable.country)
      .orderBy(desc(sql`count(*)`))

    return NextResponse.json({
      data: results.filter((r) => r.code != null),
    })
  } catch (err) {
    console.error('[GET /api/countries]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Failed to fetch countries' },
      { status: 500 },
    )
  }
}
