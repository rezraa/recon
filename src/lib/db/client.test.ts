import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() })),
}))

vi.mock('postgres', () => ({
  default: vi.fn(() => ({})),
}))

vi.mock('@/lib/config', () => ({
  getConfig: vi.fn(() => ({ DATABASE_URL: 'postgresql://localhost/testdb' })),
}))

afterEach(() => {
  vi.resetModules()
})

describe('db/client', () => {
  it('[P1] should export getDb as a function', async () => {
    const { getDb } = await import('./client')
    expect(typeof getDb).toBe('function')
  })

  it('[P1] should return a drizzle database instance with query methods', async () => {
    const { getDb } = await import('./client')
    const db = getDb()
    expect(db).toBeDefined()
    expect(db).toHaveProperty('select')
    expect(db).toHaveProperty('insert')
    expect(db).toHaveProperty('update')
  })

  it('[P1] should return the same instance on subsequent calls (singleton)', async () => {
    const { getDb } = await import('./client')
    const db1 = getDb()
    const db2 = getDb()
    expect(db1).toBe(db2)
  })
})
