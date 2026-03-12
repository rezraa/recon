import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { rssAdapter, setFeedUrls, getFeedUrls } from '@/lib/adapters/rss'
import { buildSearchUrls } from '@/lib/adapters/rss-url-translator'
import { serplyAdapter } from '@/lib/adapters/serply'
import type { RawJobListing } from '@/lib/adapters/types'
import { computeEmbedding } from '@/lib/ai/embeddings'
import { getDb } from '@/lib/db/client'
import { getSourceApiKey } from '@/lib/db/queries/sources'
import * as schema from '@/lib/db/schema'
import { normalize } from '@/lib/pipeline/normalizer'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const query = (body.query as string)?.trim()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const rsshubUrl = process.env.RSSHUB_URL ?? null
    const serplyKey = await getSourceApiKey('serply')
    const urls = buildSearchUrls(query, {
      rsshubUrl: rsshubUrl ?? undefined,
      serplyKey: serplyKey ?? undefined,
    })

    if (!urls.linkedin && !urls.serply) {
      return NextResponse.json({
        data: { found: 0, message: 'No search sources configured' },
      })
    }

    const allListings: RawJobListing[] = []

    // Fetch LinkedIn via RSSHub (through the RSS adapter)
    if (urls.linkedin) {
      try {
        const savedUrls = getFeedUrls()
        setFeedUrls([urls.linkedin])
        const listings = await rssAdapter.fetchListings({
          preferences: { targetTitles: [], locations: [], remotePreference: null },
        })
        setFeedUrls(savedUrls)
        allListings.push(...listings)
      } catch {
        // LinkedIn fetch failed — continue with other sources
      }
    }

    // Fetch Serply
    if (urls.serply && serplyKey) {
      try {
        const listings = await serplyAdapter.fetchListings({
          apiKey: serplyKey,
          preferences: {
            targetTitles: [query],
            locations: [],
            remotePreference: null,
          },
        })
        allListings.push(...listings)
      } catch {
        // Serply fetch failed — continue
      }
    }

    if (allListings.length === 0) {
      return NextResponse.json({ data: { found: 0 } })
    }

    // Normalize
    const { normalized } = await normalize(allListings)

    // Embed and insert with partial=true
    const db = getDb()
    let inserted = 0

    for (const job of normalized) {
      const text = `${job.title} ${job.company} ${job.descriptionText.slice(0, 500)}`
      const embeddingFloat32 = await computeEmbedding(text)
      const embedding = Array.from(embeddingFloat32)

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

    return NextResponse.json({ data: { found: inserted } })
  } catch (err) {
    console.error('[POST /api/jobs/search-external]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'External search failed' },
      { status: 500 },
    )
  }
}
