import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { getConfig } from '@/lib/config'
import * as schema from '@/lib/db/schema'

type DbInstance = ReturnType<typeof drizzle>

let _db: DbInstance | null = null

export function getDb(): DbInstance {
  if (!_db) {
    const config = getConfig()
    const client = postgres(config.DATABASE_URL)
    _db = drizzle(client, { schema })
  }
  return _db
}
