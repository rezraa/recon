import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PAGE_SIZE,
  HEALTH_STATUSES,
  MAX_RETRY_COUNT,
  PIPELINE_STAGES,
  POLLING_INTERVAL_MS,
  SOURCE_TYPES,
} from './constants'

describe('constants', () => {
  it('[P2] should export PIPELINE_STAGES with correct values', () => {
    expect(PIPELINE_STAGES).toEqual([
      'discovered',
      'interested',
      'applied',
      'screening',
      'interview',
      'offer',
      'rejected',
    ])
  })

  it('[P2] should export SOURCE_TYPES', () => {
    expect(SOURCE_TYPES).toEqual(['open', 'key_required'])
  })

  it('[P2] should export HEALTH_STATUSES', () => {
    expect(HEALTH_STATUSES).toEqual(['healthy', 'degraded', 'error', 'unknown'])
  })

  it('[P2] should export numeric constants', () => {
    expect(POLLING_INTERVAL_MS).toBe(30_000)
    expect(MAX_RETRY_COUNT).toBe(3)
    expect(DEFAULT_PAGE_SIZE).toBe(25)
  })
})
