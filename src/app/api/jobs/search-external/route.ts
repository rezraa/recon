import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { searchSearXNG } from '@/lib/adapters/searxng'
import { serplyAdapter } from '@/lib/adapters/serply'
import type { RawJobListing } from '@/lib/adapters/types'
import { computeEmbedding } from '@/lib/ai/embeddings'
import { getDb } from '@/lib/db/client'
import { getResume } from '@/lib/db/queries/resume'
import { getSourceApiKey } from '@/lib/db/queries/sources'
import * as schema from '@/lib/db/schema'
import { normalize } from '@/lib/pipeline/normalizer'
import { embedProfile, extractResumeProfile, scorePartialJob, type EmbeddedProfile, type ProfileExtraction } from '@/lib/pipeline/scoring'

/**
 * Broaden a resume location to the nearest major metro area for search.
 * "Fair Lawn, NJ" → "New York" (NJ is NYC metro)
 * "Arlington, VA" → "Washington DC"
 * "London, UK" → "London"
 * Falls back to state/country name.
 */
const STATE_TO_METRO: Record<string, string> = {
  NJ: 'New York', CT: 'New York', NY: 'New York',
  VA: 'Washington DC', MD: 'Washington DC', DC: 'Washington DC',
  MA: 'Boston', NH: 'Boston', RI: 'Boston',
  IL: 'Chicago', IN: 'Indianapolis',
  PA: 'Philadelphia', DE: 'Philadelphia',
  CA: 'California', TX: 'Texas', WA: 'Seattle',
  GA: 'Atlanta', CO: 'Denver', MN: 'Minneapolis',
  OR: 'Portland', NC: 'Charlotte', FL: 'Florida',
  MI: 'Detroit', OH: 'Ohio', AZ: 'Phoenix',
  MO: 'St Louis', TN: 'Nashville', WI: 'Milwaukee',
}

function broadenLocation(location: string): string {
  const parts = location.split(',').map(p => p.trim())
  const region = parts[parts.length - 1] || location
  const upper = region.toUpperCase()

  // US state → major metro
  const metro = STATE_TO_METRO[upper]
  if (metro) return metro

  // International: use the city name (first segment)
  if (parts.length >= 2) return parts[0]

  return region
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const query = (body.query as string)?.trim()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Load resume for location + partial scoring
    let resumeEmbeddings: EmbeddedProfile | null = null
    let resumeLocation: string | null = null
    try {
      const resumeRow = await getResume()
      if (resumeRow) {
        // Extract location from parsed resume data
        const parsed = resumeRow.parsedData as { location?: string } | null
        if (parsed?.location) {
          resumeLocation = parsed.location
        }

        const skills = Array.isArray(resumeRow.skills) ? (resumeRow.skills as string[]) : []
        const experience = Array.isArray(resumeRow.experience)
          ? (resumeRow.experience as Array<{ title: string; company: string; years: number | null }>)
          : []
        let profile = resumeRow.resumeExtraction as ProfileExtraction | null
        if (!profile || !profile.hardSkills || profile.hardSkills.length === 0) {
          profile = await extractResumeProfile(skills, experience)
        }
        resumeEmbeddings = await embedProfile(profile)
      }
    } catch {
      // Resume loading failed — search without location/scores
    }

    const allListings: RawJobListing[] = []

    // SearXNG search 1: location-targeted (if resume has location)
    if (resumeLocation) {
      const region = broadenLocation(resumeLocation)
      try {
        const listings = await searchSearXNG(`${query} ${region}`, {
          maxPages: 2,
          timeRange: 'week',
        })
        allListings.push(...listings)
        console.log(`[search-external] searxng local: ${listings.length} listings (${region})`)
      } catch {
        // SearXNG failed — continue
      }
    }

    // SearXNG search 2: remote jobs (always)
    try {
      const listings = await searchSearXNG(`${query} remote`, {
        maxPages: resumeLocation ? 1 : 3,
        timeRange: 'week',
      })
      allListings.push(...listings)
      console.log(`[search-external] searxng remote: ${listings.length} listings`)
    } catch {
      // SearXNG failed — continue with other sources
    }

    // Supplemental: Serply (if configured)
    const serplyKey = await getSourceApiKey('serply')
    if (serplyKey) {
      try {
        const listings = await serplyAdapter.fetchListings({
          apiKey: serplyKey,
          preferences: {
            targetTitles: [query],
            locations: resumeLocation ? [resumeLocation] : [],
            remotePreference: null,
          },
        })
        allListings.push(...listings)
        console.log(`[search-external] serply: ${listings.length} listings`)
      } catch {
        // Serply fetch failed — continue
      }
    }

    if (allListings.length === 0) {
      return NextResponse.json({ data: { found: 0 } })
    }

    // Normalize
    const { normalized } = await normalize(allListings)

    // Cache check: skip jobs already in DB (saves embed + score work)
    const db = getDb()
    const existingSet = new Set<string>()
    const pairs = normalized.map((j) => ({ source: j.sourceName, externalId: j.externalId }))

    for (let i = 0; i < pairs.length; i += 500) {
      const batch = pairs.slice(i, i + 500)
      const conditions = batch.map(
        (p) => sql`(${schema.jobsTable.sourceName} = ${p.source} AND ${schema.jobsTable.externalId} = ${p.externalId})`,
      )
      const rows = await db
        .select({ sourceName: schema.jobsTable.sourceName, externalId: schema.jobsTable.externalId })
        .from(schema.jobsTable)
        .where(sql.join(conditions, sql` OR `))
      for (const row of rows) {
        existingSet.add(`${row.sourceName}::${row.externalId}`)
      }
    }

    const newJobs = normalized.filter(
      (j) => !existingSet.has(`${j.sourceName}::${j.externalId}`),
    )

    if (newJobs.length === 0) {
      return NextResponse.json({ data: { found: 0, cacheHits: normalized.length } })
    }

    // Embed and insert with partial=true + approximate score
    let inserted = 0

    for (const job of newJobs) {
      const text = `${job.title} ${job.company} ${job.descriptionText.slice(0, 500)}`
      const embeddingFloat32 = await computeEmbedding(text)
      const embedding = Array.from(embeddingFloat32)

      // Compute approximate score from title similarity (no LLM needed)
      let matchScore: number | null = null
      let matchBreakdown: Record<string, unknown> | null = null
      if (resumeEmbeddings) {
        try {
          const partial = await scorePartialJob(job.title, resumeEmbeddings)
          matchScore = partial.matchScore
          matchBreakdown = partial.matchBreakdown as unknown as Record<string, unknown>
        } catch {
          // Scoring failed — insert without score
        }
      }

      const result = await db
        .insert(schema.jobsTable)
        .values({
          externalId: job.externalId,
          sourceName: job.sourceName,
          title: job.title,
          company: job.company,
          descriptionHtml: job.descriptionHtml ?? null,
          descriptionText: job.descriptionText,
          salaryMin: job.salaryMin ?? null,
          salaryMax: job.salaryMax ?? null,
          location: job.location ?? null,
          country: job.country,
          isRemote: job.isRemote ?? false,
          sourceUrl: job.sourceUrl,
          applyUrl: job.applyUrl ?? null,
          benefits: job.benefits ?? null,
          rawData: job.rawData,
          embedding,
          matchScore,
          matchBreakdown,
          sources: job.sources,
          partial: true,
          pipelineStage: job.pipelineStage,
          discoveredAt: job.discoveredAt,
          searchVector: sql`to_tsvector('english', ${job.searchText})`,
        })
        .onConflictDoNothing({
          target: [schema.jobsTable.sourceName, schema.jobsTable.externalId],
        })
        .returning({ id: schema.jobsTable.id })

      if (result.length > 0) inserted++
    }

    return NextResponse.json({ data: { found: inserted, cacheHits: existingSet.size } })
  } catch (err) {
    console.error('[POST /api/jobs/search-external]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'External search failed' },
      { status: 500 },
    )
  }
}
