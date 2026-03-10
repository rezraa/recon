/**
 * Company Intelligence Service
 *
 * Extracts company information (Glassdoor rating, size, funding, industry,
 * growth, recent news) via SearXNG queries and regex parsing.
 *
 * Fallback chain: Redis cache → SearXNG → "Unknown"
 */

import { Redis } from 'ioredis'

import { getConfig, parseRedisConnection } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────

export interface CompanyIntel {
  glassdoorRating: string
  companySize: string
  funding: string
  industry: string
  growth: string
  recentNews: string
  fetchedAt: Date
}

// ─── Configuration ────────────────────────────────────────────────────────

const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://searxng:8080'
const CACHE_TTL_DAYS = Number(process.env.COMPANY_INTEL_TTL_DAYS) || 7
let RATE_LIMIT_MS = Number(process.env.SEARXNG_RATE_LIMIT_MS) || 3000
const UNKNOWN_CACHE_TTL_SECONDS = 60 * 60 // 1 hour — avoid hammering SearXNG for unknown companies

// ─── Redis Client (lazy singleton) ────────────────────────────────────────

let _redis: Redis | null = null

function getRedis(): Redis {
  if (!_redis) {
    const config = getConfig()
    const conn = parseRedisConnection(config.REDIS_URL)
    _redis = new Redis({ host: conn.host, port: conn.port, lazyConnect: true })
  }
  return _redis
}

export function _setRedis(redis: Redis | null): void {
  _redis = redis
}

// ─── Company Name Normalization ───────────────────────────────────────────

export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function cacheKey(companyName: string): string {
  return `company-intel:${normalizeCompanyName(companyName)}`
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────

let lastRequestTime = 0

async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed))
  }
  lastRequestTime = Date.now()
}

export function _resetThrottle(rateLimitMs?: number): void {
  lastRequestTime = 0
  if (rateLimitMs !== undefined) {
    RATE_LIMIT_MS = rateLimitMs
  }
}

// ─── SearXNG Query ────────────────────────────────────────────────────────

export async function searxQuery(query: string): Promise<string> {
  await throttle()

  const q = encodeURIComponent(query)
  const url = `${SEARXNG_URL}/search?q=${q}&format=json`

  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    const data = (await res.json()) as {
      results?: Array<{ title?: string; content?: string; url?: string }>
    }
    return (data.results ?? [])
      .map((r) => `${r.title ?? ''} ${r.content ?? ''} ${r.url ?? ''}`)
      .join('\n')
  } catch {
    return ''
  }
}

// ─── Regex Parsers ────────────────────────────────────────────────────────

export function extractRating(text: string): string {
  const m =
    text.match(/(\d\.\d)\s*(?:out of|\/)\s*5/i) ??
    text.match(/overall\s*rating\s*(?:of|is|:)\s*(\d\.\d)/i)
  return m ? `${m[1]} / 5.0` : 'Unknown'
}

export function extractSize(text: string): string {
  const m =
    text.match(/([\d,]+-[\d,]+)\s*employees/i) ??
    text.match(/([\d,]+\+?)\s*employees/i) ??
    text.match(/([\d,]+)\s*people\s*(?:work|at)/i) ??
    text.match(/(?:has|have|with)\s*([\d,]+)\s*(?:employees|staff|people)/i)
  return m ? m[1].trim() + ' employees' : 'Unknown'
}

export function extractFunding(text: string): string {
  const totalMatch = text.match(
    /(?:total\s+)?funding\s+(?:of\s+)?\$([\d.]+[BMK])\s*(?:over\s+(\d+)\s+rounds?)?/i,
  )
  if (totalMatch) {
    return totalMatch[2]
      ? `$${totalMatch[1]} (${totalMatch[2]} rounds)`
      : `$${totalMatch[1]}`
  }

  const seriesMatch = text.match(
    /Series\s+([A-Z])\s+(?:funding\s+)?(?:round\s+)?(?:of\s+)?\$([\d.]+)\s*(billion|million|[BMK])/i,
  )
  if (seriesMatch) {
    const amount = seriesMatch[3].toLowerCase().startsWith('b')
      ? `${seriesMatch[2]}B`
      : seriesMatch[3].toLowerCase().startsWith('m')
        ? `${seriesMatch[2]}M`
        : `${seriesMatch[2]}${seriesMatch[3]}`
    return `Series ${seriesMatch[1]} ($${amount})`
  }

  const raised = text.match(
    /raised\s+\$([\d.]+)\s*(billion|million|[BMK])/i,
  )
  if (raised) {
    const suffix = raised[2].toLowerCase().startsWith('b')
      ? 'B'
      : raised[2].toLowerCase().startsWith('m')
        ? 'M'
        : raised[2]
    return `$${raised[1]}${suffix} raised`
  }

  if (
    text.match(
      /(?:publicly traded|NYSE|NASDAQ|stock price|market cap|ticker)/i,
    )
  ) {
    return 'Public'
  }

  return 'Unknown'
}

export function extractGrowth(text: string): string {
  const m =
    text.match(
      /(?:revenue|grew|growth|growing|increased|doubled|tripled)[^.]*?(\$[\d.]+[BMK]?\s*(?:to|from)\s*\$[\d.]+[BMK]?)/i,
    ) ??
    text.match(
      /(\$[\d.]+[BMK]?\s*revenue[^.]*?(?:up|grew|from)[^.]*?\$[\d.]+[BMK]?)/i,
    ) ??
    text.match(/((?:revenue|ARR)\s+(?:of\s+)?\$[\d.]+[BMK]?[^.]{0,60})/i) ??
    text.match(/(doubled\s+(?:headcount|revenue|ARR)[^.]{0,40})/i) ??
    text.match(/((?:\d+%)\s*(?:growth|increase|YoY)[^.]{0,40})/i)
  return m ? m[1].trim().slice(0, 80) : 'Unknown'
}

export function extractNews(text: string): string {
  const m =
    text.match(
      /((?:launched|announced|acquired|partnered|released|introduced|raised)\s+(?:\$[\d.]+\s*(?:billion|million|[BMK])\s*)?[^.]{10,80})/i,
    ) ??
    text.match(
      /((?:valuing|valued)\s+(?:the\s+company\s+)?at\s+\$[\d.]+\s*(?:billion|million|[BMK])[^.]{0,40})/i,
    )
  return m ? m[1].trim().slice(0, 100) : 'Unknown'
}

// ─── Industry Extraction from SearXNG Text ───────────────────────────────

export function extractIndustry(text: string): string {
  if (!text) return 'Unknown'

  // Pattern: "leading {INDUSTRY} company/provider/platform" — check before "is a" to avoid capturing "leading" in the industry phrase
  const leading = text.match(
    /leading\s+([A-Za-z][A-Za-z\s/&-]{2,50}?)\s+(?:company|platform|provider|firm|organization|startup|business)/i,
  )
  if (leading) return toTitleCase(leading[1].trim())

  // Pattern: "{Company} is a(n) {INDUSTRY} company/platform/provider/firm/organization"
  const isA = text.match(
    /is\s+an?\s+([A-Za-z][A-Za-z\s/&-]{2,50}?)\s+(?:company|platform|provider|firm|organization|startup|leader|business)/i,
  )
  if (isA) return toTitleCase(isA[1].trim())

  // Pattern: "{INDUSTRY} industry leader"
  const leader = text.match(
    /\b(?:a|an|the)\s+([A-Za-z][A-Za-z\s/&-]{2,40}?)\s+industry\s+leader/i,
  ) ?? text.match(
    /([A-Za-z][A-Za-z\s/&-]{2,40}?)\s+industry\s+leader/i,
  )
  if (leader) return toTitleCase(leader[1].trim())

  // Pattern: "specializes in {INDUSTRY}"
  const specializes = text.match(
    /specializes?\s+in\s+([A-Za-z][A-Za-z\s/&-]{2,50})(?:\.|,|$)/i,
  )
  if (specializes) return toTitleCase(specializes[1].trim())

  return 'Unknown'
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|[\s/])\S/g, (c) => c.toUpperCase())
}

// ─── Cache Layer ──────────────────────────────────────────────────────────

async function getFromCache(companyName: string): Promise<CompanyIntel | null> {
  try {
    const redis = getRedis()
    const raw = await redis.get(cacheKey(companyName))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { ...parsed, fetchedAt: new Date(parsed.fetchedAt) }
  } catch {
    return null
  }
}

async function setInCache(companyName: string, intel: CompanyIntel, ttlOverrideSeconds?: number): Promise<void> {
  try {
    const redis = getRedis()
    const ttlSeconds = ttlOverrideSeconds ?? CACHE_TTL_DAYS * 24 * 60 * 60
    await redis.set(cacheKey(companyName), JSON.stringify(intel), 'EX', ttlSeconds)
  } catch {
    // Cache write failure is non-fatal
  }
}

export async function _resetCacheFor(companyName: string): Promise<void> {
  try {
    const redis = getRedis()
    await redis.del(cacheKey(companyName))
  } catch {
    // Cache delete failure is non-fatal
  }
}

// ─── SearXNG Extraction ──────────────────────────────────────────────────

async function fetchFromSearXNG(companyName: string): Promise<Omit<CompanyIntel, 'fetchedAt'> | null> {
  try {
    // Sequential to respect rate limiter (each call throttles independently)
    const ratingText = await searxQuery(`${companyName} glassdoor rating`)
    const infoText = await searxQuery(`${companyName} company size funding employees revenue`)

    // If both queries returned nothing, SearXNG is likely down
    if (!ratingText && !infoText) return null

    return {
      glassdoorRating: extractRating(ratingText),
      companySize: extractSize(infoText),
      funding: extractFunding(infoText),
      growth: extractGrowth(infoText),
      recentNews: extractNews(infoText),
      industry: extractIndustry(infoText),
    }
  } catch {
    return null
  }
}

// ─── Observability ───────────────────────────────────────────────────────

const INTEL_FIELDS = ['glassdoorRating', 'companySize', 'funding', 'industry', 'growth', 'recentNews'] as const

function logFieldHitRates(company: string, intel: CompanyIntel, source: string): void {
  const unknownFields = INTEL_FIELDS.filter((f) => intel[f] === 'Unknown')
  if (unknownFields.length > 0) {
    console.warn(
      `[company-intel] ${company} via ${source}: ${unknownFields.length}/${INTEL_FIELDS.length} fields Unknown (${unknownFields.join(', ')})`,
    )
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────

export async function getCompanyIntel(
  companyName: string,
): Promise<CompanyIntel> {
  // 1. Redis cache
  const cached = await getFromCache(companyName)
  if (cached) return cached

  // 2. SearXNG query
  const searxResult = await fetchFromSearXNG(companyName)
  const now = new Date()

  if (searxResult) {
    const intel: CompanyIntel = {
      ...searxResult,
      fetchedAt: now,
    }
    await setInCache(companyName, intel)
    logFieldHitRates(companyName, intel, 'searxng')
    return intel
  }

  // 4. All failed — cache Unknown with short TTL to avoid repeated retries
  const unknown: CompanyIntel = {
    glassdoorRating: 'Unknown',
    companySize: 'Unknown',
    funding: 'Unknown',
    industry: 'Unknown',
    growth: 'Unknown',
    recentNews: 'Unknown',
    fetchedAt: now,
  }
  await setInCache(companyName, unknown, UNKNOWN_CACHE_TTL_SECONDS)
  console.warn(`[company-intel] ${companyName}: all sources failed, returning Unknown`)
  return unknown
}
