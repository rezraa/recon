import { z } from 'zod'

export const REMOTE_PREFERENCES = [
  'remote_only',
  'hybrid_ok',
  'onsite_ok',
  'no_preference',
] as const

export type RemotePreference = (typeof REMOTE_PREFERENCES)[number]

export const preferencesSchema = z
  .object({
    target_titles: z.array(z.string().min(1)).min(1),
    salary_min: z.number().positive().optional(),
    salary_max: z.number().positive().optional(),
    locations: z.array(z.string()).optional().default([]),
    remote_preference: z.enum(REMOTE_PREFERENCES).optional().default('no_preference'),
  })
  .refine(
    (data) => {
      if (data.salary_min !== undefined && data.salary_max !== undefined) {
        return data.salary_min <= data.salary_max
      }
      return true
    },
    {
      message: 'Minimum salary must be less than maximum',
      path: ['salary_min'],
    },
  )

export type PreferencesInput = z.input<typeof preferencesSchema>
export type PreferencesData = z.output<typeof preferencesSchema>
