import { beforeEach, describe, expect, it, vi } from 'vitest'

import { envSchema, getConfig, parseRedisConnection } from './config'

describe('envSchema', () => {
  it('[P0] should require DATABASE_URL', () => {
    const result = envSchema.safeParse({
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should require REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should accept valid config with required fields', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(result.success).toBe(true)
  })

  it('[P0] should reject empty string for DATABASE_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: '',
      REDIS_URL: 'redis://localhost:6379',
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject empty string for REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost:5432/recon',
      REDIS_URL: '',
    })
    expect(result.success).toBe(false)
  })

  it('[P1] should accept optional API keys', () => {
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

  it('[P1] should return parsed config from process.env', () => {
    const config = getConfig()
    expect(config.DATABASE_URL).toBe('postgresql://localhost:5432/recon')
    expect(config.REDIS_URL).toBe('redis://localhost:6379')
  })

  it('[P1] should throw when required fields are missing', () => {
    vi.unstubAllEnvs()
    // Clear the required env vars
    delete process.env.DATABASE_URL
    delete process.env.REDIS_URL
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
