export interface ExperienceEntry {
  title: string
  company: string
  years: number | null
}

export interface ParsedResume {
  skills: string[]
  experience: ExperienceEntry[]
  jobTitles: string[]
}
