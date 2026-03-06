import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'

import { getConfig, parseRedisConnection } from '@/lib/config'
import { getDb } from '@/lib/db/client'

function log(level: 'info' | 'warn' | 'error', event: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...extra,
  }))
}

export async function startWorker() {
  log('info', 'worker.starting')

  const config = getConfig()

  // Verify DB connectivity with a real query
  const db = getDb()
  await db.execute(sql`SELECT 1`)
  log('info', 'worker.db.connected')

  const redisConnection = parseRedisConnection(config.REDIS_URL)

  // Create worker listening on discovery-pipeline queue
  // Processors will be registered in Epic 2 stories
  const worker = new Worker(
    'discovery-pipeline',
    async (job) => {
      log('info', 'worker.job.received', { jobName: job.name, jobId: job.id })
    },
    { connection: redisConnection },
  )

  worker.on('ready', () => {
    log('info', 'worker.ready', { queue: 'discovery-pipeline' })
  })

  worker.on('failed', (job, err) => {
    log('error', 'worker.job.failed', {
      jobName: job?.name,
      jobId: job?.id,
      error: err.message,
    })
  })

  // Graceful shutdown on Docker stop / SIGTERM
  const shutdown = async () => {
    log('info', 'worker.shutdown')
    await worker.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  log('info', 'worker.idle', { queue: 'discovery-pipeline' })

  return worker
}

// Auto-start when run directly (not when imported for testing)
const isDirectRun = process.argv[1]?.endsWith('worker/index.js') ||
  process.argv[1]?.endsWith('worker/index.ts')

if (isDirectRun) {
  startWorker().catch((err) => {
    log('error', 'worker.fatal', { error: err instanceof Error ? err.message : String(err) })
    process.exit(1)
  })
}
