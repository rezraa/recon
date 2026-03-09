import { faker } from '@faker-js/faker'
import type { z } from 'zod'

import type { selectJobSchema } from '@/lib/db/schema'

export type JobRecord = z.infer<typeof selectJobSchema>

export function createJob(overrides?: Partial<JobRecord>): JobRecord {
  return {
    id: crypto.randomUUID(),
    externalId: faker.string.nanoid(),
    sourceName: faker.helpers.arrayElement(['linkedin', 'indeed', 'remoteok', 'jobicy']),
    title: faker.person.jobTitle(),
    company: faker.company.name(),
    descriptionHtml: `<p>${faker.lorem.paragraph()}</p>`,
    descriptionText: faker.lorem.paragraph(),
    salaryMin: faker.number.int({ min: 60000, max: 120000 }),
    salaryMax: faker.number.int({ min: 120000, max: 250000 }),
    location: faker.location.city(),
    isRemote: faker.datatype.boolean(),
    sourceUrl: faker.internet.url(),
    applyUrl: faker.internet.url(),
    embedding: null,
    sources: [],
    dedupConfidence: null,
    benefits: null,
    rawData: null,
    matchScore: null,
    matchBreakdown: null,
    pipelineStage: 'discovered',
    discoveredAt: faker.date.recent(),
    reviewedAt: null,
    appliedAt: null,
    stageChangedAt: null,
    isDismissed: false,
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    searchVector: null,
    ...overrides,
  }
}
