import { faker } from '@faker-js/faker'
import type { z } from 'zod'

import type { selectSourceSchema } from '@/lib/db/schema'

export type SourceRecord = z.infer<typeof selectSourceSchema>

export function createSource(overrides?: Partial<SourceRecord>): SourceRecord {
  return {
    id: crypto.randomUUID(),
    name: faker.lorem.slug(),
    displayName: faker.company.name(),
    type: faker.helpers.arrayElement(['api', 'scraper', 'rss']),
    isEnabled: true,
    lastFetchAt: null,
    lastError: null,
    listingsCount: faker.number.int({ min: 0, max: 500 }),
    healthStatus: 'healthy',
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }
}
