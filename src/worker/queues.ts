import { Queue } from 'bullmq'

import { getConfig, parseRedisConnection } from '@/lib/config'

export function createDiscoveryQueue(): Queue {
  const config = getConfig()
  return new Queue('discovery-pipeline', {
    connection: parseRedisConnection(config.REDIS_URL),
  })
}

export function createRescoreQueue(): Queue {
  const config = getConfig()
  return new Queue('rescore-pipeline', {
    connection: parseRedisConnection(config.REDIS_URL),
  })
}
