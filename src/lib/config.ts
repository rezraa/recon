import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SERPLY_API_KEY: z.string().optional(),
  REMOTEOK_API_KEY: z.string().optional(),
  JOBICY_API_KEY: z.string().optional(),
  ARBEITNOW_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
})

export type EnvConfig = z.infer<typeof envSchema>

export function getConfig(): EnvConfig {
  return envSchema.parse(process.env)
}
