import { faker } from '@faker-js/faker'
import type { z } from 'zod'

import type { selectSourceSchema } from '@/lib/db/schema'

export type SourceRecord = z.infer<typeof selectSourceSchema>

export function createSource(overrides?: Partial<SourceRecord>): SourceRecord {
  return {
    id: crypto.randomUUID(),
    name: faker.lorem.slug(),
    displayName: faker.company.name(),
    type: faker.helpers.arrayElement(['open', 'key_required']),
    isEnabled: true,
    lastFetchAt: null,
    lastError: null,
    listingsCount: faker.number.int({ min: 0, max: 500 }),
    healthStatus: 'healthy',
    config: null,
    errorCount: 0,
    consecutiveErrors: 0,
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }
}
