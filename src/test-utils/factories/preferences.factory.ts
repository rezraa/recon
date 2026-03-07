import { faker } from '@faker-js/faker'
import type { z } from 'zod'

import type { selectPreferencesSchema } from '@/lib/db/schema'

export type PreferencesRecord = z.infer<typeof selectPreferencesSchema>

export function createPreferences(overrides?: Partial<PreferencesRecord>): PreferencesRecord {
  const createdAt = faker.date.recent()
  return {
    id: crypto.randomUUID(),
    targetTitles: [faker.person.jobTitle(), faker.person.jobTitle()],
    salaryMin: faker.number.int({ min: 60000, max: 120000 }),
    salaryMax: faker.number.int({ min: 120000, max: 250000 }),
    locations: [faker.location.city()],
    remotePreference: faker.helpers.arrayElement(['remote_only', 'hybrid_ok', 'onsite_ok', 'no_preference']),
    createdAt,
    updatedAt: new Date(createdAt.getTime() + faker.number.int({ min: 0, max: 86400000 })),
    ...overrides,
  }
}
