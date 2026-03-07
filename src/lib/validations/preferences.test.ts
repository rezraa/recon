import { describe, expect, it } from 'vitest'

import { preferencesSchema } from './preferences'

describe('preferencesSchema', () => {
  it('[P0] should accept valid data with all fields', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Frontend Engineer', 'Full Stack Developer'],
      salary_min: 80000,
      salary_max: 150000,
      locations: ['San Francisco', 'Remote'],
      remote_preference: 'remote_only',
    })
    expect(result.success).toBe(true)
  })

  it('[P0] should accept valid data with only required fields', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Software Engineer'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.locations).toEqual([])
      expect(result.data.remote_preference).toBe('no_preference')
    }
  })

  it('[P0] should reject empty target_titles array', () => {
    const result = preferencesSchema.safeParse({
      target_titles: [],
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject missing target_titles', () => {
    const result = preferencesSchema.safeParse({
      salary_min: 80000,
    })
    expect(result.success).toBe(false)
  })

  it('[P1] should reject empty strings in target_titles', () => {
    const result = preferencesSchema.safeParse({
      target_titles: [''],
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject when salary_min > salary_max', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Engineer'],
      salary_min: 150000,
      salary_max: 80000,
    })
    expect(result.success).toBe(false)
  })

  it('[P1] should accept when salary_min equals salary_max', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Engineer'],
      salary_min: 100000,
      salary_max: 100000,
    })
    expect(result.success).toBe(true)
  })

  it('[P1] should accept when only salary_min is provided', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Engineer'],
      salary_min: 80000,
    })
    expect(result.success).toBe(true)
  })

  it('[P1] should accept when only salary_max is provided', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Engineer'],
      salary_max: 150000,
    })
    expect(result.success).toBe(true)
  })

  it('[P1] should reject negative salary values', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Engineer'],
      salary_min: -1,
    })
    expect(result.success).toBe(false)
  })

  it('[P1] should reject invalid remote_preference values', () => {
    const result = preferencesSchema.safeParse({
      target_titles: ['Engineer'],
      remote_preference: 'invalid_value',
    })
    expect(result.success).toBe(false)
  })

  it('[P2] should accept all valid remote_preference values', () => {
    for (const pref of ['remote_only', 'hybrid_ok', 'onsite_ok', 'no_preference']) {
      const result = preferencesSchema.safeParse({
        target_titles: ['Engineer'],
        remote_preference: pref,
      })
      expect(result.success).toBe(true)
    }
  })
})
