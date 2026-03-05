import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { envSchema, getConfig } from './config'

describe('envSchema', () => {
  it('should require DATABASE_URL', () => {
    const result = envSchema.safeParse({
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(result.success).toBe(false)
  })

  it('should require REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
    })
    expect(result.success).toBe(false)
  })

  it('should accept valid config with required fields', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty string for DATABASE_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: '',
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty string for REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: '',
    })
    expect(result.success).toBe(false)
  })

  it('should accept optional API keys', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: 'redis://localhost:6379',
      SERPLY_API_KEY: 'key-123',
      GEMINI_API_KEY: 'gemini-key',
    })
    expect(result.success).toBe(true)
  })
})

describe('getConfig', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/recon')
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should return parsed config from process.env', () => {
    const config = getConfig()
    expect(config.DATABASE_URL).toBe('postgresql://localhost:5432/recon')
    expect(config.REDIS_URL).toBe('redis://localhost:6379')
  })

  it('should throw when required fields are missing', () => {
    vi.unstubAllEnvs()
    // Clear the required env vars
    delete process.env.DATABASE_URL
    delete process.env.REDIS_URL
    expect(() => getConfig()).toThrow()
  })
})
