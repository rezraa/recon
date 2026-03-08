import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be a 64-character hex string'),
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
