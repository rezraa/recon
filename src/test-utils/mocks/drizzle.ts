import { vi } from 'vitest'

export interface DrizzleMockChain {
  mockReturning: ReturnType<typeof vi.fn>
  mockWhere: ReturnType<typeof vi.fn>
  mockSet: ReturnType<typeof vi.fn>
  mockLimit: ReturnType<typeof vi.fn>
  mockFrom: ReturnType<typeof vi.fn>
  mockSelect: ReturnType<typeof vi.fn>
  mockValues: ReturnType<typeof vi.fn>
  mockInsert: ReturnType<typeof vi.fn>
  mockUpdate: ReturnType<typeof vi.fn>
  mockThen: ReturnType<typeof vi.fn>
  mockTxLimit: ReturnType<typeof vi.fn>
  mockTxFrom: ReturnType<typeof vi.fn>
  mockTxSelect: ReturnType<typeof vi.fn>
  mockTxInsert: ReturnType<typeof vi.fn>
  mockTxUpdate: ReturnType<typeof vi.fn>
  mockTransaction: ReturnType<typeof vi.fn>
}

/**
 * Creates a full Drizzle query builder mock chain.
 * Returns individual mocks for fine-grained assertions.
 *
 * Usage:
 *   const drizzle = createDrizzleMock()
 *   vi.mock('@/lib/db/client', () => ({ getDb: vi.fn(() => drizzle.db) }))
 */
export function createDrizzleMock() {
  const mockReturning = vi.fn()
  const mockWhere = vi.fn(() => ({ returning: mockReturning }))
  const mockSet = vi.fn(() => ({ where: mockWhere }))
  const mockLimit = vi.fn()
  const mockFrom = vi.fn(() => ({ limit: mockLimit }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  const mockValues = vi.fn(() => ({ returning: mockReturning }))
  const mockInsert = vi.fn(() => ({ values: mockValues }))
  const mockUpdate = vi.fn(() => ({ set: mockSet }))
  const mockThen = vi.fn()
  const mockTxLimit = vi.fn(() => ({ then: mockThen }))
  const mockTxFrom = vi.fn(() => ({ limit: mockTxLimit }))
  const mockTxSelect = vi.fn(() => ({ from: mockTxFrom }))
  const mockTxInsert = vi.fn(() => ({ values: mockValues }))
  const mockTxUpdate = vi.fn(() => ({ set: mockSet }))

  const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({
      select: mockTxSelect,
      insert: mockTxInsert,
      update: mockTxUpdate,
    })
  })

  const db = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  }

  return {
    db,
    mockReturning,
    mockWhere,
    mockSet,
    mockLimit,
    mockFrom,
    mockSelect,
    mockValues,
    mockInsert,
    mockUpdate,
    mockThen,
    mockTxLimit,
    mockTxFrom,
    mockTxSelect,
    mockTxInsert,
    mockTxUpdate,
    mockTransaction,
  }
}

/**
 * Standard drizzle-orm mock — use with vi.mock('drizzle-orm', () => drizzleOrmMock)
 */
export const drizzleOrmMock = {
  eq: vi.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ _sql: strings.join(''), values }),
    { raw: vi.fn() },
  ),
}
