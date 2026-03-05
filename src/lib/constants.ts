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
