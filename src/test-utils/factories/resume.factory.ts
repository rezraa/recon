import { faker } from '@faker-js/faker'
import type { z } from 'zod'

import type { selectResumeSchema } from '@/lib/db/schema'
import type { ExperienceEntry, ParsedResume } from '@/lib/pipeline/resumeTypes'

export type ResumeRecord = z.infer<typeof selectResumeSchema>

export function createParsedResume(overrides?: Partial<ParsedResume>): ParsedResume {
  return {
    skills: [faker.hacker.noun(), faker.hacker.noun()],
    experience: [],
    jobTitles: [faker.person.jobTitle()],
    ...overrides,
  }
}

export function createExperience(overrides?: Partial<ExperienceEntry>): ExperienceEntry {
  return {
    title: faker.person.jobTitle(),
    company: faker.company.name(),
    years: faker.number.int({ min: 1, max: 15 }),
    ...overrides,
  }
}

export function createResume(overrides?: Partial<ResumeRecord>): ResumeRecord {
  const parsed = createParsedResume()
  const uploadedAt = faker.date.recent()
  return {
    id: crypto.randomUUID(),
    fileName: `${faker.system.fileName({ extensionCount: 0 })}.pdf`,
    parsedData: parsed,
    skills: parsed.skills,
    resumeExtraction: null,
    experience: [],
    uploadedAt,
    updatedAt: new Date(uploadedAt.getTime() + faker.number.int({ min: 0, max: 86400000 })),
    ...overrides,
  }
}
