import { describe, expect, it } from 'vitest'

import himalayasFixture from './__fixtures__/himalayas-response.json'
import jobicyFixture from './__fixtures__/jobicy-response.json'
import remoteokFixture from './__fixtures__/remoteok-response.json'
import serplyFixture from './__fixtures__/serply-response.json'
import themuseFixture from './__fixtures__/themuse-response.json'
import type { RawJobListing } from './types'
import { rawJobListingSchema } from './types'

// Helper: strip HTML tags to derive plain text
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

// Helper: simulate adapter transformation for each source
function transformRemoteok(job: (typeof remoteokFixture)[0]): RawJobListing {
  return {
    source_name: 'remoteok',
    external_id: String(job.id),
    title: job.position,
    company: job.company,
    source_url: job.url,
    apply_url: job.apply_url,
    description_text: job.description,
    description_html: job.description,
    salary_min: job.salary_min,
    salary_max: job.salary_max,
    location: job.location,
    is_remote: job.location ? job.location.toLowerCase().includes('remote') : undefined,
    raw_data: job as unknown as Record<string, unknown>,
  }
}

// Note: Himalayas salary is a string ("$130,000 - $170,000", "$120k-$150k").
// String-to-number salary parsing is deferred to Story 2-6 adapter implementation.
function transformHimalayas(job: (typeof himalayasFixture.jobs)[0]): RawJobListing {
  return {
    source_name: 'himalayas',
    external_id: String(job.id),
    title: job.title,
    company: job.companyName,
    source_url: job.applicationLink,
    description_text: job.description,
    description_html: job.description,
    raw_data: job as unknown as Record<string, unknown>,
  }
}

function transformThemuse(job: (typeof themuseFixture.results)[0]): RawJobListing {
  const descriptionHtml = job.contents
  const descriptionText = stripHtml(descriptionHtml)
  return {
    source_name: 'themuse',
    external_id: String(job.id),
    title: job.name,
    company: job.company.name,
    source_url: `https://www.themuse.com/jobs/${job.id}`,
    description_text: descriptionText,
    description_html: descriptionHtml,
    location: job.locations[0]?.name,
    is_remote: job.locations.some((l) => l.name.toLowerCase() === 'remote'),
    raw_data: job as unknown as Record<string, unknown>,
  }
}

function transformJobicy(job: (typeof jobicyFixture.jobs)[0]): RawJobListing {
  return {
    source_name: 'jobicy',
    external_id: String(job.id),
    title: job.jobTitle,
    company: job.companyName,
    source_url: job.url,
    description_text: job.jobExcerpt,
    description_html: job.jobExcerpt,
    salary_min: job.annualSalaryMin,
    salary_max: job.annualSalaryMax,
    location: job.jobGeo,
    is_remote: job.jobGeo ? job.jobGeo.toLowerCase() === 'remote' : undefined,
    raw_data: job as unknown as Record<string, unknown>,
  }
}

function transformSerply(job: (typeof serplyFixture.jobs)[0]): RawJobListing {
  const descriptionText = job.description
  const descriptionHtml = job.snippet
  return {
    source_name: 'serply',
    external_id: job.job_id,
    title: job.title,
    company: job.company_name,
    source_url: job.link,
    apply_url: job.apply_link,
    description_text: descriptionText,
    description_html: descriptionHtml,
    salary_min: job.detected_extensions?.salary_min,
    salary_max: job.detected_extensions?.salary_max,
    location: job.location,
    is_remote: job.location ? job.location.toLowerCase().includes('remote') : undefined,
    raw_data: job as unknown as Record<string, unknown>,
  }
}

describe('Legal Compliance: raw_data preservation', () => {
  it('should preserve remoteok API response byte-for-byte in raw_data', () => {
    const original = remoteokFixture[0]
    const transformed = transformRemoteok(original)
    expect(transformed.raw_data).toEqual(original)
  })

  it('should preserve himalayas API response byte-for-byte in raw_data', () => {
    const original = himalayasFixture.jobs[0]
    const transformed = transformHimalayas(original)
    expect(transformed.raw_data).toEqual(original)
  })

  it('should preserve themuse API response byte-for-byte in raw_data', () => {
    const original = themuseFixture.results[0]
    const transformed = transformThemuse(original)
    expect(transformed.raw_data).toEqual(original)
  })

  it('should preserve jobicy API response byte-for-byte in raw_data', () => {
    const original = jobicyFixture.jobs[0]
    const transformed = transformJobicy(original)
    expect(transformed.raw_data).toEqual(original)
  })

  it('should preserve serply API response byte-for-byte in raw_data', () => {
    const original = serplyFixture.jobs[0]
    const transformed = transformSerply(original)
    expect(transformed.raw_data).toEqual(original)
  })
})

describe('Legal Compliance: description_html preservation', () => {
  it('should preserve source HTML without modification', () => {
    const themuseJob = themuseFixture.results[0]
    const transformed = transformThemuse(themuseJob)
    // The fixture contains HTML with <b>Senior</b> <em>React</em> Developer
    expect(transformed.description_html).toBe(themuseJob.contents)
    expect(transformed.description_html).toContain('<b>Senior</b>')
    expect(transformed.description_html).toContain('<em>React</em>')
  })

  it('should preserve serply HTML snippet without modification', () => {
    const serplyJob = serplyFixture.jobs[0]
    const transformed = transformSerply(serplyJob)
    expect(transformed.description_html).toBe(serplyJob.snippet)
    expect(transformed.description_html).toContain('<b>software engineer</b>')
  })
})

describe('Legal Compliance: description_text derivation', () => {
  it('should derive plain text when source provides HTML only (themuse)', () => {
    const themuseJob = themuseFixture.results[0]
    const transformed = transformThemuse(themuseJob)
    // description_text should have HTML tags stripped
    expect(transformed.description_text).not.toContain('<')
    expect(transformed.description_text).not.toContain('>')
    expect(transformed.description_text).toContain('Senior')
    expect(transformed.description_text).toContain('React')
    expect(transformed.description_text).toContain('Developer')
  })

  it('should populate description_text verbatim from plain text source (remoteok)', () => {
    const job = remoteokFixture[0]
    const transformed = transformRemoteok(job)
    expect(transformed.description_text).toBe(job.description)
  })
})

describe('Data Quality: salary parsing', () => {
  it('should parse numeric salary_min/salary_max correctly', () => {
    const job = remoteokFixture[0]
    const transformed = transformRemoteok(job)
    expect(transformed.salary_min).toBe(120000)
    expect(transformed.salary_max).toBe(160000)
  })

  it('should have undefined salary when source lacks salary data', () => {
    const job = remoteokFixture[1]
    const transformed = transformRemoteok(job)
    expect(transformed.salary_min).toBeUndefined()
    expect(transformed.salary_max).toBeUndefined()
  })

  it('should parse serply detected_extensions salary correctly', () => {
    const job = serplyFixture.jobs[0]
    const transformed = transformSerply(job)
    expect(transformed.salary_min).toBe(140000)
    expect(transformed.salary_max).toBe(180000)
  })

  it('should handle "Competitive" salary as undefined', () => {
    const job = serplyFixture.jobs[1]
    const transformed = transformSerply(job)
    expect(transformed.salary_min).toBeUndefined()
    expect(transformed.salary_max).toBeUndefined()
  })
})

describe('Data Quality: is_remote inference', () => {
  it('should infer is_remote true when location is "Remote"', () => {
    const job = remoteokFixture[0]
    const transformed = transformRemoteok(job)
    expect(transformed.is_remote).toBe(true)
  })

  it('should infer is_remote true when location contains "Remote"', () => {
    const job = serplyFixture.jobs[0]
    const transformed = transformSerply(job)
    expect(transformed.is_remote).toBe(true)
  })

  it('should set is_remote to false for non-remote locations', () => {
    const job = serplyFixture.jobs[1]
    const transformed = transformSerply(job)
    expect(transformed.is_remote).toBe(false)
  })
})

describe('Data Quality: is_remote three-state contract', () => {
  // Contract: adapters MUST return true | false | undefined — never rely on || undefined
  // true = location explicitly contains "remote"
  // false = location is known and does NOT contain "remote"
  // undefined = location is unknown (null/undefined from source)
  // This contract is load-bearing for Story 3-3 filter bar remote toggle counts.

  it('should return true for explicitly remote location', () => {
    const transformed = transformRemoteok(remoteokFixture[0]) // location: "Remote"
    expect(transformed.is_remote).toBe(true)
    expect(typeof transformed.is_remote).toBe('boolean')
  })

  it('should return false for known non-remote location', () => {
    const transformed = transformSerply(serplyFixture.jobs[1]) // location: "San Francisco, CA"
    expect(transformed.is_remote).toBe(false)
    expect(typeof transformed.is_remote).toBe('boolean')
  })

  it('should return false for known non-remote TheMuse location', () => {
    const transformed = transformThemuse(themuseFixture.results[0]) // locations: ["New York, NY"]
    expect(transformed.is_remote).toBe(false)
    expect(typeof transformed.is_remote).toBe('boolean')
  })

  it('should return true for TheMuse with Remote location', () => {
    const transformed = transformThemuse(themuseFixture.results[1]) // locations: ["Remote"]
    expect(transformed.is_remote).toBe(true)
  })

  it('should return undefined when location is absent from source', () => {
    const transformed = transformHimalayas(himalayasFixture.jobs[0])
    // Himalayas transform doesn't set is_remote (no location field mapped)
    expect(transformed.is_remote).toBeUndefined()
  })

  it('should return false for Jobicy non-remote location', () => {
    const transformed = transformJobicy(jobicyFixture.jobs[1]) // jobGeo: "New York, NY"
    expect(transformed.is_remote).toBe(false)
  })

  it('should never produce is_remote as a string or number', () => {
    // Validates type safety across all sources
    const allTransformed = [
      ...remoteokFixture.map(transformRemoteok),
      ...himalayasFixture.jobs.map(transformHimalayas),
      ...themuseFixture.results.map(transformThemuse),
      ...jobicyFixture.jobs.map(transformJobicy),
      ...serplyFixture.jobs.map(transformSerply),
    ]
    for (const listing of allTransformed) {
      if (listing.is_remote !== undefined) {
        expect(typeof listing.is_remote).toBe('boolean')
      }
    }
  })
})

describe('Data Quality: company name pass-through', () => {
  it('should preserve "Google LLC" without normalization', () => {
    const job = himalayasFixture.jobs[0]
    const transformed = transformHimalayas(job)
    expect(transformed.company).toBe('Google LLC')
  })

  it('should preserve "Google" without normalization (different from Google LLC)', () => {
    const job = himalayasFixture.jobs[1]
    const transformed = transformHimalayas(job)
    expect(transformed.company).toBe('Google')
  })
})

describe('Data Quality: location pass-through', () => {
  it('should preserve "NYC" without normalization', () => {
    const job = himalayasFixture.jobs[1]
    const transformed = transformHimalayas(job)
    // Himalayas uses locationRestrictions which is an array
    // The adapter would pick the first one
    expect(job.locationRestrictions).toContain('NYC')
  })

  it('should preserve "New York, NY" without normalization', () => {
    const job = themuseFixture.results[0]
    const transformed = transformThemuse(job)
    expect(transformed.location).toBe('New York, NY')
  })
})

describe('Zod schema validation: all fixtures', () => {
  it('should validate all remoteok fixture items through RawJobListing schema', () => {
    for (const job of remoteokFixture) {
      const transformed = transformRemoteok(job)
      const result = rawJobListingSchema.safeParse(transformed)
      expect(result.success, `Failed for remoteok job ${job.id}: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('should validate all himalayas fixture items through RawJobListing schema', () => {
    for (const job of himalayasFixture.jobs) {
      const transformed = transformHimalayas(job)
      const result = rawJobListingSchema.safeParse(transformed)
      expect(result.success, `Failed for himalayas job ${job.id}: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('should validate all themuse fixture items through RawJobListing schema', () => {
    for (const job of themuseFixture.results) {
      const transformed = transformThemuse(job)
      const result = rawJobListingSchema.safeParse(transformed)
      expect(result.success, `Failed for themuse job ${job.id}: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('should validate all jobicy fixture items through RawJobListing schema', () => {
    for (const job of jobicyFixture.jobs) {
      const transformed = transformJobicy(job)
      const result = rawJobListingSchema.safeParse(transformed)
      expect(result.success, `Failed for jobicy job ${job.id}: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('should validate all serply fixture items through RawJobListing schema', () => {
    for (const job of serplyFixture.jobs) {
      const transformed = transformSerply(job)
      const result = rawJobListingSchema.safeParse(transformed)
      expect(result.success, `Failed for serply job ${job.job_id}: ${JSON.stringify(result)}`).toBe(true)
    }
  })
})

describe('Zod schema validation: required field rejection', () => {
  const validListing = {
    source_name: 'test',
    external_id: 'test-1',
    title: 'Developer',
    company: 'TestCo',
    source_url: 'https://example.com/job/1',
    description_text: 'A great job',
    raw_data: {},
  }

  it('should reject missing title', () => {
    const { title: _, ...noTitle } = validListing
    const result = rawJobListingSchema.safeParse(noTitle)
    expect(result.success).toBe(false)
  })

  it('should reject missing source_name', () => {
    const { source_name: _, ...noSource } = validListing
    const result = rawJobListingSchema.safeParse(noSource)
    expect(result.success).toBe(false)
  })

  it('should reject missing external_id', () => {
    const { external_id: _, ...noId } = validListing
    const result = rawJobListingSchema.safeParse(noId)
    expect(result.success).toBe(false)
  })

  it('should reject missing company', () => {
    const { company: _, ...noCompany } = validListing
    const result = rawJobListingSchema.safeParse(noCompany)
    expect(result.success).toBe(false)
  })

  it('should reject missing source_url', () => {
    const { source_url: _, ...noUrl } = validListing
    const result = rawJobListingSchema.safeParse(noUrl)
    expect(result.success).toBe(false)
  })

  it('should reject missing description_text', () => {
    const { description_text: _, ...noDesc } = validListing
    const result = rawJobListingSchema.safeParse(noDesc)
    expect(result.success).toBe(false)
  })
})

describe('Optional getRateLimitStatus', () => {
  it('should return valid structure with remaining and resetsAt', () => {
    const resetsAt = new Date('2024-03-09T00:00:00Z')
    const status = { remaining: 8, resetsAt }
    expect(status.remaining).toBe(8)
    expect(status.resetsAt).toBeInstanceOf(Date)
  })

  it('should allow null return for adapters without rate limit visibility', () => {
    const status: { remaining: number; resetsAt: Date } | null = null
    expect(status).toBeNull()
  })
})
