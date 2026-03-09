// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useDiscoveryStatus } from './useDiscoveryStatus'

vi.mock('swr', () => ({
  default: vi.fn((key: string | null) => {
    if (key === null) {
      return { data: undefined, error: undefined, isLoading: false }
    }
    if (key.includes('run-running')) {
      return {
        data: {
          data: {
            status: 'running',
            sources_completed: 2,
            sources_total: 5,
            listings_new: 30,
            started_at: '2026-03-09T10:00:00Z',
          },
        },
        error: undefined,
        isLoading: false,
      }
    }
    if (key.includes('run-done')) {
      return {
        data: {
          data: {
            status: 'completed',
            sources_completed: 5,
            sources_total: 5,
            listings_new: 87,
            started_at: '2026-03-09T10:00:00Z',
          },
        },
        error: undefined,
        isLoading: false,
      }
    }
    return { data: undefined, error: undefined, isLoading: true }
  }),
}))

describe('useDiscoveryStatus', () => {
  it('[P1] should return null status when runId is null', () => {
    const { result } = renderHook(() => useDiscoveryStatus(null))

    expect(result.current.status).toBeNull()
    expect(result.current.isComplete).toBe(false)
  })

  it('[P1] should return running status with progress', () => {
    const { result } = renderHook(() => useDiscoveryStatus('run-running'))

    expect(result.current.status).toBe('running')
    expect(result.current.sourcesCompleted).toBe(2)
    expect(result.current.sourcesTotal).toBe(5)
    expect(result.current.isComplete).toBe(false)
  })

  it('[P1] should return completed status', () => {
    const { result } = renderHook(() => useDiscoveryStatus('run-done'))

    expect(result.current.status).toBe('completed')
    expect(result.current.listingsNew).toBe(87)
    expect(result.current.isComplete).toBe(true)
  })
})
