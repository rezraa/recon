import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
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

export function parseRedisConnection(redisUrl: string): { host: string; port: number } {
  const url = new URL(redisUrl)
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
  }
}
