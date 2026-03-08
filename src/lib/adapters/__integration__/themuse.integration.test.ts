import { describe, expect, it } from 'vitest'

import { rawJobListingSchema } from '../types'

describe('The Muse Integration', () => {
  it('should fetch real job listings and validate response shape', async () => {
    const response = await fetch('https://www.themuse.com/api/public/jobs?page=1&api_version=2')

    expect(response.ok).toBe(true)

    const data = await response.json()
    expect(data).toHaveProperty('results')
    expect(Array.isArray(data.results)).toBe(true)
    expect(data.results.length).toBeGreaterThan(0)

    const job = data.results[0]
    expect(job).toHaveProperty('id')
    expect(job).toHaveProperty('name')
    expect(job).toHaveProperty('company')

    // Normalize and validate
    const normalized = {
      source_name: 'themuse',
      external_id: String(job.id),
      title: job.name || '',
      company: job.company?.name || '',
      source_url: `https://www.themuse.com/jobs/${job.id}`,
      description_text: job.contents || '',
      raw_data: job,
    }

    const result = rawJobListingSchema.safeParse(normalized)
    expect(result.success).toBe(true)

    // Compliance: source_url points to themuse.com
    expect(normalized.source_url).toContain('themuse.com')

    // Compliance: no image/logo fields
    expect(normalized).not.toHaveProperty('company_logo')
    expect(normalized).not.toHaveProperty('logo')
  })
})
