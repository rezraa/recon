export interface SourceRecord {
  id: string
  name: string
  displayName: string | null
  type: string | null
  isEnabled: boolean | null
  lastFetchAt: Date | null
  lastError: unknown | null
  listingsCount: number | null
  healthStatus: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

let sourceCounter = 0

export function createSource(overrides?: Partial<SourceRecord>): SourceRecord {
  sourceCounter++
  return {
    id: crypto.randomUUID(),
    name: `source-${Date.now()}-${sourceCounter}`,
    displayName: `Test Source ${sourceCounter}`,
    type: 'api',
    isEnabled: true,
    lastFetchAt: null,
    lastError: null,
    listingsCount: 0,
    healthStatus: 'healthy',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}
