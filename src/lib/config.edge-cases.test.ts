import { describe, expect, it, vi, afterEach } from 'vitest'

import { envSchema, getConfig, parseRedisConnection } from './config'

describe('parseRedisConnection edge cases', () => {
  it('[P1] defaults to 6379 when port is 0 (falsy)', () => {
    // Number(0) || 6379 = 6379 because 0 is falsy in the implementation
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

    // URL.hostname preserves brackets for IPv6
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
    })

    expect(result.success).toBe(false)
  })

  it('[P1] rejects empty REDIS_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      REDIS_URL: '',
    })

    expect(result.success).toBe(false)
  })

  it('[P1] accepts all optional API keys present', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      REDIS_URL: 'redis://localhost:6379',
      SERPLY_API_KEY: 'key1',
      REMOTEOK_API_KEY: 'key2',
      JOBICY_API_KEY: 'key3',
      ARBEITNOW_API_KEY: 'key4',
      GEMINI_API_KEY: 'key5',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.SERPLY_API_KEY).toBe('key1')
      expect(result.data.GEMINI_API_KEY).toBe('key5')
    }
  })

  it('[P1] strips unknown fields by default', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      REDIS_URL: 'redis://localhost:6379',
      UNKNOWN_FIELD: 'should be stripped',
    })

    // Zod strips unknown keys by default
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).UNKNOWN_FIELD).toBeUndefined()
    }
  })
})

describe('getConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('[P1] returns config when required env vars are set', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/testdb')
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')

    const config = getConfig()

    expect(config.DATABASE_URL).toBe('postgresql://localhost/testdb')
    expect(config.REDIS_URL).toBe('redis://localhost:6379')
  })

  it('[P1] throws when DATABASE_URL is missing', () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')

    expect(() => getConfig()).toThrow()
  })
})
