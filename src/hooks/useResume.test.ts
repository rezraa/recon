// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { SWRConfig } from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

import { useResume, useResumeRedirect } from './useResume'

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      SWRConfig,
      { value: { dedupingInterval: 0, provider: () => new Map() } },
      children,
    )
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  mockReplace.mockClear()
})

describe('useResume', () => {
  it('should return data when resume exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: '1', fileName: 'resume.pdf' } }), { status: 200 }),
    )

    const { result } = renderHook(() => useResume(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.data).toEqual({ id: '1', fileName: 'resume.pdf' })
    expect(result.current.error).toBeUndefined()
  })

  it('should return null when resume not found (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }),
    )

    const { result } = renderHook(() => useResume(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeUndefined()
  })

  it('should set error on non-404 failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500 }),
    )

    const { result } = renderHook(() => useResume(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })
  })

  it('should be loading initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})) // never resolves

    const { result } = renderHook(() => useResume(), { wrapper: createWrapper() })

    expect(result.current.isLoading).toBe(true)
  })
})

describe('useResumeRedirect', () => {
  it('should redirect when resume exists and when=exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: '1' } }), { status: 200 }),
    )

    renderHook(
      () => useResumeRedirect({ redirectTo: '/', when: 'exists' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/')
    })
  })

  it('should redirect when resume missing and when=missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }),
    )

    renderHook(
      () => useResumeRedirect({ redirectTo: '/onboarding', when: 'missing' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('should NOT redirect when resume exists and when=missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: '1' } }), { status: 200 }),
    )

    const { result } = renderHook(
      () => useResumeRedirect({ redirectTo: '/onboarding', when: 'missing' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('should NOT redirect while loading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

    renderHook(
      () => useResumeRedirect({ redirectTo: '/', when: 'exists' }),
      { wrapper: createWrapper() },
    )

    expect(mockReplace).not.toHaveBeenCalled()
  })
})
