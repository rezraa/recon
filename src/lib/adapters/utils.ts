import { SourceError } from '@/lib/errors'

import type { RawJobListing } from './types'
import { rawJobListingSchema } from './types'

// ─── fetchWithTimeout ──────────────────────────────────────────────────────

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    if (!response.ok) {
      const statusError = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { status: number }
      statusError.status = response.status
      throw statusError
    }

    return response
  } catch (error) {
    if (error instanceof SourceError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SourceError({
        sourceName: 'unknown',
        errorType: 'timeout',
        message: `Request to ${url} timed out after ${timeoutMs}ms`,
      })
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── stripHtml ─────────────────────────────────────────────────────────────

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── parseSalaryString ─────────────────────────────────────────────────────

export function parseSalaryString(
  salary: string | number | null | undefined,
): { min?: number; max?: number } {
  if (salary === null || salary === undefined) {
    return {}
  }

  if (typeof salary === 'number') {
    return { min: salary }
  }

  const cleaned = salary.replace(/,/g, '').replace(/\s/g, '')

  // Match patterns like "$120k-$150k", "$120000-$150000", "$120,000 - $150,000/yr"
  const rangeMatch = cleaned.match(
    /\$?([\d.]+)(k)?(?:[-–—]|to)\$?([\d.]+)(k)?/i,
  )
  if (rangeMatch) {
    let min = parseFloat(rangeMatch[1])
    let max = parseFloat(rangeMatch[3])
    if (rangeMatch[2]?.toLowerCase() === 'k') min *= 1000
    if (rangeMatch[4]?.toLowerCase() === 'k') max *= 1000
    return { min, max }
  }

  // Match single value like "$120k" or "$120,000"
  const singleMatch = cleaned.match(/\$?([\d.]+)(k)?/i)
  if (singleMatch) {
    let value = parseFloat(singleMatch[1])
    if (singleMatch[2]?.toLowerCase() === 'k') value *= 1000
    // If "Competitive" or non-numeric text matched partially, ignore
    if (isNaN(value)) return {}
    return { min: value }
  }

  return {}
}

// ─── inferRemote ───────────────────────────────────────────────────────────

export function inferRemote(location: string | null | undefined): boolean | undefined {
  return location
    ? location.toLowerCase().includes('remote')
    : undefined
}

// ─── validateListings ──────────────────────────────────────────────────────

export function validateListings(
  listings: unknown[],
  sourceName: string,
): RawJobListing[] {
  const valid: RawJobListing[] = []
  let skipped = 0

  for (const listing of listings) {
    const result = rawJobListingSchema.safeParse(listing)
    if (result.success) {
      valid.push(result.data)
    } else {
      skipped++
    }
  }

  if (skipped > 0) {
    console.warn(`[${sourceName}] Skipped ${skipped}/${listings.length} invalid listings`)
  }

  return valid
}
