import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock bullmq with class-based constructor
vi.mock('bullmq', () => {
  return {
    Queue: class MockQueue {
      constructor(public name: string, public opts?: unknown) {}
    },
  }
})

// Mock config
vi.mock('@/lib/config', () => ({
  getConfig: vi.fn().mockReturnValue({
    DATABASE_URL: 'postgresql://recon:recon@localhost:5432/recon',
    REDIS_URL: 'redis://localhost:6379',
  }),
  parseRedisConnection: vi.fn().mockReturnValue({ host: 'localhost', port: 6379 }),
}))

describe('worker/queues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('[P2] should export createDiscoveryQueue function', async () => {
    const mod = await import('./queues')
    expect(mod.createDiscoveryQueue).toBeDefined()
    expect(typeof mod.createDiscoveryQueue).toBe('function')
  })

  it('[P1] should create queue with kebab-case name "discovery-pipeline"', async () => {
    const mod = await import('./queues')
    const queue = mod.createDiscoveryQueue() as unknown as { name: string }
    expect(queue.name).toBe('discovery-pipeline')
  })

  it('[P2] should use named exports only (no default export)', async () => {
    const mod = await import('./queues')
    expect(mod).not.toHaveProperty('default')
  })

  it('[P1] should use parseRedisConnection for connection config', async () => {
    const { parseRedisConnection } = await import('@/lib/config')
    const mod = await import('./queues')
    mod.createDiscoveryQueue()

    expect(parseRedisConnection).toHaveBeenCalledWith('redis://localhost:6379')
  })
})

describe('worker import boundary', () => {
  it('[P2] should only import from @/lib/ (not @/app/ or @/components/)', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const workerDir = path.resolve(__dirname)
    const workerFiles = fs.readdirSync(workerDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))

    for (const file of workerFiles) {
      const content = fs.readFileSync(path.join(workerDir, file), 'utf-8')
      expect(content).not.toMatch(/from ['"]@\/app\//)
      expect(content).not.toMatch(/from ['"]@\/components\//)
    }
  })
})
