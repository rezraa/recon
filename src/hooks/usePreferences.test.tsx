// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePreferences } from './usePreferences'

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      {children}
    </SWRConfig>
  )
}

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

describe('usePreferences', () => {
  it('[P0] should return preferences data on success', async () => {
    const prefsData = { id: 'pref-1', targetTitles: ['Engineer'] }
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: prefsData }),
    })

    const { result } = renderHook(() => usePreferences(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(prefsData)
    expect(result.current.error).toBeUndefined()
  })

  it('[P1] should return null when 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 404 } }),
    })

    const { result } = renderHook(() => usePreferences(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeUndefined()
  })

  it('[P1] should set error on non-404 failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 500 } }),
    })

    const { result } = renderHook(() => usePreferences(), { wrapper })

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })
  })
})
