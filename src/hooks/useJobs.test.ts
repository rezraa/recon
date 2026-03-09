// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useJobs } from './useJobs'

// Mock SWR
vi.mock('swr', () => ({
  default: vi.fn((key: string) => {
    if (key === '/api/jobs') {
      return {
        data: {
          data: {
            jobs: [{ id: 'j1', title: 'Dev', matchScore: 80 }],
            total: 1,
          },
        },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      }
    }
    if (key === '/api/jobs?limit=5&offset=10') {
      return {
        data: {
          data: {
            jobs: [{ id: 'j2', title: 'PM', matchScore: 60 }],
            total: 50,
          },
        },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      }
    }
    return { data: undefined, error: undefined, isLoading: true, mutate: vi.fn() }
  }),
}))

describe('useJobs', () => {
  it('[P1] should return jobs and total from SWR response', () => {
    const { result } = renderHook(() => useJobs())

    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.jobs[0].title).toBe('Dev')
    expect(result.current.total).toBe(1)
    expect(result.current.isLoading).toBe(false)
  })

  it('[P1] should build query string from params', () => {
    const { result } = renderHook(() => useJobs({ limit: 5, offset: 10 }))

    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.total).toBe(50)
  })

  it('[P1] should return empty defaults when no data', () => {
    const { result } = renderHook(() => useJobs({ limit: 999 }))

    expect(result.current.jobs).toEqual([])
    expect(result.current.total).toBe(0)
    expect(result.current.isLoading).toBe(true)
  })
})
