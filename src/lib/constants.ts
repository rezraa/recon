export const PIPELINE_STAGES = [
  'discovered',
  'interested',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]

export const POLLING_INTERVAL_MS = 30_000

export const MAX_RETRY_COUNT = 3

export const SOURCE_TYPES = ['open', 'key_required'] as const
export type SourceType = typeof SOURCE_TYPES[number]

export const HEALTH_STATUSES = ['healthy', 'degraded', 'error', 'unknown'] as const
export type HealthStatus = typeof HEALTH_STATUSES[number]

export const DEFAULT_PAGE_SIZE = 25
