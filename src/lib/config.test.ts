import { beforeEach, describe, expect, it, vi } from 'vitest'

import { envSchema, getConfig, parseRedisConnection } from './config'

const VALID_ENCRYPTION_KEY = 'a'.repeat(64)

describe('envSchema', () => {
  it('[P0] should require DATABASE_URL', () => {
    const result = envSchema.safeParse({
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should require REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should accept valid config with required fields', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    })
    expect(result.success).toBe(true)
  })

  it('[P0] should reject empty string for DATABASE_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: '',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject empty string for REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: '',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should require ENCRYPTION_KEY', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject ENCRYPTION_KEY with wrong length', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: 'too-short',
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject ENCRYPTION_KEY with non-hex characters', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: 'g'.repeat(64),
    })
    expect(result.success).toBe(false)
  })
})

describe('getConfig', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/recon')
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    vi.stubEnv('ENCRYPTION_KEY', VALID_ENCRYPTION_KEY)
  })

  it('[P1] should return parsed config from process.env', () => {
    const config = getConfig()
    expect(config.DATABASE_URL).toBe('postgresql://localhost:5432/recon')
    expect(config.REDIS_URL).toBe('redis://localhost:6379')
    expect(config.ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY)
  })

  it('[P1] should throw when required fields are missing', () => {
    vi.unstubAllEnvs()
    delete process.env.DATABASE_URL
    delete process.env.REDIS_URL
    delete process.env.ENCRYPTION_KEY
    expect(() => getConfig()).toThrow()
  })
})

describe('parseRedisConnection', () => {
  it('[P1] should parse host and port from redis URL', () => {
    const result = parseRedisConnection('redis://myhost:6380')
    expect(result).toEqual({ host: 'myhost', port: 6380 })
  })

  it('[P1] should default to port 6379 when no port specified', () => {
    const result = parseRedisConnection('redis://myhost')
    expect(result).toEqual({ host: 'myhost', port: 6379 })
  })

  it('[P1] should parse localhost URL', () => {
    const result = parseRedisConnection('redis://localhost:6379')
    expect(result).toEqual({ host: 'localhost', port: 6379 })
  })

  it('[P1] should handle redis URL with credentials', () => {
    const result = parseRedisConnection('redis://user:pass@redis.example.com:6380')
    expect(result).toEqual({ host: 'redis.example.com', port: 6380 })
  })

  it('[P1] should throw on invalid URL', () => {
    expect(() => parseRedisConnection('not-a-url')).toThrow()
  })
})
