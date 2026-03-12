import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockOn = vi.fn()
const mockClose = vi.fn().mockResolvedValue(undefined)

// Mock bullmq with class-based constructors
vi.mock('bullmq', () => {
  return {
    Worker: class MockWorker {
      on = mockOn
      close = mockClose
      constructor(public name: string, public processor: unknown, public opts: unknown) {}
    },
    Queue: class MockQueue {
      constructor(public name: string, public opts?: unknown) {}
    },
  }
})

// Mock drizzle-orm sql tagged template
vi.mock('drizzle-orm', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}))

// Mock config
vi.mock('@/lib/config', () => ({
  getConfig: vi.fn().mockReturnValue({
    DATABASE_URL: 'postgresql://recon:recon@localhost:5432/recon',
    REDIS_URL: 'redis://localhost:6379',
  }),
  parseRedisConnection: vi.fn().mockReturnValue({ host: 'localhost', port: 6379 }),
}))

// Mock db client
vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('worker/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('[P2] should export startWorker function', async () => {
    const mod = await import('./index')
    expect(mod.startWorker).toBeDefined()
    expect(typeof mod.startWorker).toBe('function')
  })

  it('[P1] should start worker and return all worker instances', async () => {
    const mod = await import('./index')
    const result = await mod.startWorker()
    expect(result).toBeDefined()
    expect(result.discoveryWorker).toBeDefined()
    expect(result.rescoreWorker).toBeDefined()
    expect(result.enrichWorker).toBeDefined()
    expect(result.discoveryWorker.on).toBeDefined()
    expect(result.rescoreWorker.on).toBeDefined()
    expect(result.enrichWorker.on).toBeDefined()
  })

  it('[P1] should initialize with discovery-pipeline, rescore-pipeline, and enrich-pipeline queues', async () => {
    const mod = await import('./index')
    const result = await mod.startWorker() as unknown as {
      discoveryWorker: { name: string }
      rescoreWorker: { name: string }
      enrichWorker: { name: string }
    }
    expect(result.discoveryWorker.name).toBe('discovery-pipeline')
    expect(result.rescoreWorker.name).toBe('rescore-pipeline')
    expect(result.enrichWorker.name).toBe('enrich-pipeline')
  })

  it('[P2] should register event listeners on worker', async () => {
    const mod = await import('./index')
    await mod.startWorker()

    expect(mockOn).toHaveBeenCalledWith('ready', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('failed', expect.any(Function))
  })

  it('[P1] should verify DB connectivity on startup', async () => {
    const { getDb } = await import('@/lib/db/client')
    const mod = await import('./index')
    await mod.startWorker()

    expect(getDb).toHaveBeenCalled()
    const db = (getDb as ReturnType<typeof vi.fn>).mock.results[0].value
    expect(db.execute).toHaveBeenCalled()
  })

  it('[P1] should use parseRedisConnection for Redis config', async () => {
    const { parseRedisConnection } = await import('@/lib/config')
    const mod = await import('./index')
    await mod.startWorker()

    expect(parseRedisConnection).toHaveBeenCalledWith('redis://localhost:6379')
  })
})
