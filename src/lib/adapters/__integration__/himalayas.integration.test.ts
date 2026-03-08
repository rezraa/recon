import { describe, expect, it } from 'vitest'

import { rawJobListingSchema } from '../types'

describe('Himalayas Integration', () => {
  it('should fetch real job listings and validate response shape', async () => {
    const response = await fetch('https://himalayas.app/jobs/api?limit=5')

    expect(response.ok).toBe(true)

    const data = await response.json()
    expect(data).toHaveProperty('jobs')
    expect(Array.isArray(data.jobs)).toBe(true)
    expect(data.jobs.length).toBeGreaterThan(0)

    const job = data.jobs[0]
    expect(job).toHaveProperty('id')
    expect(job).toHaveProperty('title')
    expect(job).toHaveProperty('companyName')

    // Normalize and validate
    const normalized = {
      source_name: 'himalayas',
      external_id: String(job.id),
      title: job.title || '',
      company: job.companyName || '',
      source_url: job.applicationLink || `https://himalayas.app/jobs/${job.id}`,
      description_text: job.description || '',
      raw_data: job,
    }

    const result = rawJobListingSchema.safeParse(normalized)
    expect(result.success).toBe(true)

    // Compliance: no image/logo fields
    expect(normalized).not.toHaveProperty('company_logo')
    expect(normalized).not.toHaveProperty('logo')
  })
})
