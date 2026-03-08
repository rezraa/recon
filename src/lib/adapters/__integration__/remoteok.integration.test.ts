import { describe, expect, it } from 'vitest'

import { rawJobListingSchema } from '../types'

describe('RemoteOK Integration', () => {
  it('should fetch real job listings and validate against RawJobListing schema', async () => {
    const response = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'recon-job-aggregator/0.1.0' },
    })

    expect(response.ok).toBe(true)

    const data = await response.json()
    // RemoteOK returns an array — first element is metadata, rest are jobs
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(1)

    // Validate first real job (skip index 0 which is metadata)
    const job = data[1]
    expect(job).toHaveProperty('id')
    expect(job).toHaveProperty('company')

    // Normalize to RawJobListing and validate
    const normalized = {
      source_name: 'remoteok',
      external_id: String(job.id),
      title: job.position || job.title || '',
      company: job.company || '',
      source_url: `https://remoteok.com/remote-jobs/${job.slug || job.id}`,
      description_text: job.description || '',
      raw_data: job,
    }

    const result = rawJobListingSchema.safeParse(normalized)
    expect(result.success).toBe(true)

    // Compliance: source_url must point to remoteok.com
    expect(normalized.source_url).toContain('remoteok.com')

    // Compliance: no image/logo fields in normalized output
    expect(normalized).not.toHaveProperty('company_logo')
    expect(normalized).not.toHaveProperty('logo')

    // Compliance: description_text matches original
    expect(normalized.description_text).toBe(job.description || '')
  })
})
