import { describe, expect, it, vi } from 'vitest'

import { envSchema, getConfig, parseRedisConnection } from './config'

const VALID_ENCRYPTION_KEY = 'a'.repeat(64)

describe('parseRedisConnection edge cases', () => {
  it('[P1] defaults to 6379 when port is 0 (falsy)', () => {
    const result = parseRedisConnection('redis://localhost:0')

    expect(result).toEqual({ host: 'localhost', port: 6379 })
  })

  it('[P1] handles port 65535', () => {
    const result = parseRedisConnection('redis://localhost:65535')

    expect(result).toEqual({ host: 'localhost', port: 65535 })
  })

  it('[P1] defaults to 6379 when no port specified', () => {
    const result = parseRedisConnection('redis://myhost.example.com')

    expect(result).toEqual({ host: 'myhost.example.com', port: 6379 })
  })

  it('[P1] handles IPv6 address in URL', () => {
    const result = parseRedisConnection('redis://[::1]:6380')

    expect(result.host).toBe('[::1]')
    expect(result.port).toBe(6380)
  })

  it('[P1] handles redis URL with auth and database path', () => {
    const result = parseRedisConnection('redis://user:pass@redis.example.com:6380/0')

    expect(result).toEqual({ host: 'redis.example.com', port: 6380 })
  })
})

describe('envSchema edge cases', () => {
  it('[P1] rejects empty DATABASE_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: '',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    })

    expect(result.success).toBe(false)
  })

  it('[P1] rejects empty REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      REDIS_URL: '',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    })

    expect(result.success).toBe(false)
  })

  it('[P1] strips unknown fields by default', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
      UNKNOWN_FIELD: 'should be stripped',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect('UNKNOWN_FIELD' in result.data).toBe(false)
    }
  })

  it('[P1] rejects ENCRYPTION_KEY that is not exactly 64 chars', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      REDIS_URL: 'redis://localhost:6379',
      ENCRYPTION_KEY: 'a'.repeat(32),
    })

    expect(result.success).toBe(false)
  })
})

describe('getConfig', () => {
  it('[P1] returns config when required env vars are set', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/testdb')
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    vi.stubEnv('ENCRYPTION_KEY', VALID_ENCRYPTION_KEY)

    const config = getConfig()

    expect(config.DATABASE_URL).toBe('postgresql://localhost/testdb')
    expect(config.REDIS_URL).toBe('redis://localhost:6379')
    expect(config.ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY)
  })

  it('[P1] throws when DATABASE_URL is missing', () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    vi.stubEnv('ENCRYPTION_KEY', VALID_ENCRYPTION_KEY)

    expect(() => getConfig()).toThrow()
  })
})
