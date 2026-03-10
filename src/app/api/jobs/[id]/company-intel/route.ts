import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db/client'
import { getCompanyIntelByName, upsertCompanyIntel } from '@/lib/db/queries/company-intel'
import { getResume } from '@/lib/db/queries/resume'
import { jobsTable } from '@/lib/db/schema'
import { _resetCacheFor,getCompanyIntel } from '@/lib/pipeline/company-intel'
import { extractSkillMatches } from '@/lib/pipeline/skills'

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

// ─── Skill Overlap (per-request, never cached) ─────────────────────────────

async function computeSkillOverlap(descriptionText: string | null): Promise<string[]> {
  if (!descriptionText) return []
  const resumeRow = await getResume()
  if (!resumeRow) return []
  const skills = Array.isArray(resumeRow.skills) ? resumeRow.skills as string[] : []
  return extractSkillMatches(descriptionText, skills)
}

// ─── GET: on-demand fetch (DB cache → Redis → SearXNG) ──────────────────────

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

    // Compute skill overlap (per-request, never cached)
    const skillOverlap = await computeSkillOverlap(job.descriptionText)

    // Check DB cache first (persisted from previous lookups)
    const existing = await getCompanyIntelByName(job.company)
    if (existing) {
      return NextResponse.json({ data: { ...existing, skillOverlap } })
    }

    // On-demand fetch: Redis cache → SearXNG → Unknown
    const intel = await getCompanyIntel(job.company)

    // Persist to DB for future API queries
    await upsertCompanyIntel(job.company, intel)

    return NextResponse.json({ data: { ...intel, skillOverlap } })
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

    // Compute skill overlap (per-request, never cached)
    const skillOverlap = await computeSkillOverlap(job.descriptionText)

    // Bust Redis cache for this company
    await _resetCacheFor(job.company)

    // Force fresh fetch (skips Redis cache since we just cleared it)
    const intel = await getCompanyIntel(job.company)

    // Persist fresh result to DB
    await upsertCompanyIntel(job.company, intel)

    return NextResponse.json({ data: { ...intel, skillOverlap } })
  } catch (err) {
    console.error('[POST /api/jobs/[id]/company-intel]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: { code: 500, message: 'Failed to refresh company intelligence' } },
      { status: 500 },
    )
  }
}
