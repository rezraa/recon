import { Worker } from 'bullmq'
import { exec } from 'child_process'
import { sql } from 'drizzle-orm'
import { promisify } from 'util'

import { getConfig, parseRedisConnection } from '@/lib/config'
import { getDb } from '@/lib/db/client'

import { log } from './logger'
import { discoveryProcessor } from './processors/discovery'
import { rescoreProcessor } from './processors/scoring'

const execAsync = promisify(exec)

export async function startWorker() {
  log('info', 'worker.starting')

  // Run migrations idempotently on startup (async — does not block event loop)
  try {
    await execAsync('npx drizzle-kit migrate')
    log('info', 'worker.migrations.complete')
  } catch (err) {
    log('warn', 'worker.migrations.skipped', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const config = getConfig()

  // Verify DB connectivity with a real query
  const db = getDb()
  await db.execute(sql`SELECT 1`)
  log('info', 'worker.db.connected')

  const redisConnection = parseRedisConnection(config.REDIS_URL)

  // Create worker listening on discovery-pipeline queue
  const worker = new Worker(
    'discovery-pipeline',
    discoveryProcessor,
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

  // Rescore worker
  const rescoreWorker = new Worker(
    'rescore-pipeline',
    rescoreProcessor,
    { connection: redisConnection },
  )

  rescoreWorker.on('ready', () => {
    log('info', 'worker.ready', { queue: 'rescore-pipeline' })
  })

  rescoreWorker.on('failed', (job, err) => {
    log('error', 'worker.job.failed', {
      jobName: job?.name,
      jobId: job?.id,
      error: err.message,
    })
  })

  // Graceful shutdown on Docker stop / SIGTERM
  const shutdown = async () => {
    log('info', 'worker.shutdown')
    await Promise.all([worker.close(), rescoreWorker.close()])
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  log('info', 'worker.idle', { queue: 'discovery-pipeline' })

  return { discoveryWorker: worker, rescoreWorker }
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
