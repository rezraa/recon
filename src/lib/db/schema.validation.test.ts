import { describe, expect, it } from 'vitest'

import {
  insertJobSchema,
  insertPreferencesSchema,
  insertResumeSchema,
  insertSourceSchema,
  selectResumeSchema,
} from './schema'

describe('insertResumeSchema', () => {
  it('[P1] accepts valid resume data with all fields', () => {
    const data = {
      fileName: 'resume.pdf',
      parsedData: { skills: ['TypeScript'], experience: [], jobTitles: ['Engineer'] },
      skills: ['TypeScript', 'React'],
      experience: [{ title: 'Dev', company: 'Co', years: 2 }],
    }

    const result = insertResumeSchema.safeParse(data)

    expect(result.success).toBe(true)
  })

  it('[P2] accepts resume with null parsedData, skills, experience (nullable jsonb)', () => {
    const data = {
      parsedData: null,
      skills: null,
      experience: null,
    }

    const result = insertResumeSchema.safeParse(data)

    expect(result.success).toBe(true)
  })

  it('[P2] accepts resume with no optional fields (bare minimum)', () => {
    const data = {}

    const result = insertResumeSchema.safeParse(data)

    // All fields on resumesTable have defaults or are nullable
    expect(result.success).toBe(true)
  })
})

describe('insertJobSchema', () => {
  it('[P1] accepts valid job with all fields', () => {
    const data = {
      externalId: 'ext-123',
      sourceName: 'linkedin',
      title: 'Software Engineer',
      company: 'Acme Corp',
      descriptionHtml: '<p>Build things.</p>',
      descriptionText: 'Build things.',
      salaryMin: 100000,
      salaryMax: 150000,
      location: 'Remote',
      isRemote: true,
      sourceUrl: 'https://example.com/job/123',
      applyUrl: 'https://example.com/apply/123',
      benefits: ['health', '401k'],
      rawData: { foo: 'bar' },
      matchScore: 85,
      matchBreakdown: { skills: 90, location: 80 },
      pipelineStage: 'discovered',
    }

    const result = insertJobSchema.safeParse(data)

    expect(result.success).toBe(true)
  })

  it('[P1] accepts minimal job (only required: externalId, sourceName)', () => {
    const data = {
      externalId: 'ext-456',
      sourceName: 'indeed',
    }

    const result = insertJobSchema.safeParse(data)

    expect(result.success).toBe(true)
  })

  it('[P0] rejects job missing externalId', () => {
    const data = {
      sourceName: 'indeed',
    }

    const result = insertJobSchema.safeParse(data)

    expect(result.success).toBe(false)
  })

  it('[P0] rejects job missing sourceName', () => {
    const data = {
      externalId: 'ext-789',
    }

    const result = insertJobSchema.safeParse(data)

    expect(result.success).toBe(false)
  })
})

describe('insertSourceSchema', () => {
  it('[P0] requires name field', () => {
    const result = insertSourceSchema.safeParse({})

    expect(result.success).toBe(false)
  })

  it('[P1] accepts valid source with name', () => {
    const data = { name: 'linkedin' }

    const result = insertSourceSchema.safeParse(data)

    expect(result.success).toBe(true)
  })

  it('[P1] accepts source with all optional fields', () => {
    const data = {
      name: 'indeed',
      displayName: 'Indeed',
      type: 'scraper',
      isEnabled: true,
      listingsCount: 42,
      healthStatus: 'healthy',
    }

    const result = insertSourceSchema.safeParse(data)

    expect(result.success).toBe(true)
  })
})

describe('insertPreferencesSchema', () => {
  it('[P1] accepts valid preferences', () => {
    const data = {
      targetTitles: ['Software Engineer', 'Senior Developer'],
      salaryMin: 120000,
      salaryMax: 200000,
      locations: ['San Francisco', 'Remote'],
      remotePreference: 'remote-only',
    }

    const result = insertPreferencesSchema.safeParse(data)

    expect(result.success).toBe(true)
  })

  it('[P2] accepts empty preferences (all fields optional)', () => {
    const result = insertPreferencesSchema.safeParse({})

    expect(result.success).toBe(true)
  })
})

describe('selectResumeSchema', () => {
  it('[P1] parses a DB row with all fields', () => {
    const row = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      fileName: 'resume.pdf',
      parsedData: { skills: ['TS'] },
      skills: ['TS'],
      experience: [],
      uploadedAt: new Date(),
      updatedAt: new Date(),
    }

    const result = selectResumeSchema.safeParse(row)

    expect(result.success).toBe(true)
  })

  it('[P2] parses a DB row with null optional fields', () => {
    const row = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      fileName: null,
      parsedData: null,
      skills: null,
      experience: null,
      uploadedAt: null,
      updatedAt: null,
    }

    const result = selectResumeSchema.safeParse(row)

    expect(result.success).toBe(true)
  })
})
