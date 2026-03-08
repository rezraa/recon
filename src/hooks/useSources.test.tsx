// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { describe, expect, it, vi } from 'vitest'

import { useSources } from './useSources'

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      {children}
    </SWRConfig>
  )
}

describe('useSources', () => {
  it('should fetch sources data', async () => {
    const mockData = [
      { name: 'remoteok', displayName: 'Remote OK', type: 'open', isConfigured: true },
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: mockData }), { status: 200 }),
      ),
    )

    const { result } = renderHook(() => useSources(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(mockData)
    expect(result.current.error).toBeUndefined()
  })

  it('should handle API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })),
    )

    const { result } = renderHook(() => useSources(), { wrapper })

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })
  })

  it('should return null for 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    )

    const { result } = renderHook(() => useSources(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeNull()
  })
})
