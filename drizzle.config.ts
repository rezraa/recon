import { defineConfig } from 'drizzle-kit'

// NOTE: Raw process.env is acceptable here — drizzle.config.ts is a build-time
// config file loaded by drizzle-kit CLI, not application runtime code.
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://recon:recon@localhost:5432/recon',
  },
})
