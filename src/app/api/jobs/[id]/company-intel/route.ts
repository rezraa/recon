import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { getCompanyIntelByName, upsertCompanyIntel } from '@/lib/db/queries/company-intel'
import { jobsTable } from '@/lib/db/schema'
import { _resetCacheFor,getCompanyIntel } from '@/lib/pipeline/company-intel'

// ─── Shared: look up job by ID ─────────────────────────────────────────────

async function lookupJob(id: string) {
  const db = getDb()
  const rows = await db
    .select({
      company: jobsTable.company,
      descriptionText: jobsTable.descriptionText,
    })
    .from(jobsTable)
    .where(eq(jobsTable.id, id))
    .limit(1)
  return rows[0] ?? null
}

// ─── GET: on-demand fetch (DB cache → Redis → seed → SearXNG) ──────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const job = await lookupJob(id)
    if (!job?.company) {
      return NextResponse.json(
        { error: { code: 404, message: 'Job not found or has no company' } },
        { status: 404 },
      )
    }

    // Check DB cache first (persisted from previous lookups)
    const existing = await getCompanyIntelByName(job.company)
    if (existing) {
      return NextResponse.json({ data: existing })
    }

    // On-demand fetch: Redis cache → seed → SearXNG → Unknown
    const intel = await getCompanyIntel(job.company, job.descriptionText ?? undefined)

    // Persist to DB for future API queries
    await upsertCompanyIntel(job.company, intel)

    return NextResponse.json({ data: intel })
  } catch (err) {
    console.error('[GET /api/jobs/[id]/company-intel]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: { code: 500, message: 'Failed to fetch company intelligence' } },
      { status: 500 },
    )
  }
}

// ─── POST: force-refresh (bust all caches, re-fetch from SearXNG) ──────────

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const job = await lookupJob(id)
    if (!job?.company) {
      return NextResponse.json(
        { error: { code: 404, message: 'Job not found or has no company' } },
        { status: 404 },
      )
    }

    // Bust Redis cache for this company
    await _resetCacheFor(job.company)

    // Force fresh fetch (skips Redis cache since we just cleared it, skips seed)
    const intel = await getCompanyIntel(job.company, job.descriptionText ?? undefined)

    // Persist fresh result to DB
    await upsertCompanyIntel(job.company, intel)

    return NextResponse.json({ data: intel })
  } catch (err) {
    console.error('[POST /api/jobs/[id]/company-intel]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: { code: 500, message: 'Failed to refresh company intelligence' } },
      { status: 500 },
    )
  }
}
