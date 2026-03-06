import type { ParsedResume, ExperienceEntry } from '@/lib/pipeline/resumeTypes'

export interface ResumeRecord {
  id: string
  fileName: string | null
  parsedData: ParsedResume | null
  skills: string[] | null
  experience: ExperienceEntry[] | null
  uploadedAt: Date
  updatedAt: Date
}

export function createResume(overrides?: Partial<ResumeRecord>): ResumeRecord {
  return {
    id: crypto.randomUUID(),
    fileName: `resume-${Date.now()}.pdf`,
    parsedData: {
      skills: ['TypeScript', 'React'],
      experience: [],
      jobTitles: ['Software Engineer'],
    },
    skills: ['TypeScript', 'React'],
    experience: [],
    uploadedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}
