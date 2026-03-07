// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
}))

import { useResumeUpload } from './useResumeUpload'

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as typeof fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useResumeUpload', () => {
  it('[P1] should start in idle state', () => {
    const { result } = renderHook(() => useResumeUpload())
    expect(result.current.state).toBe('idle')
    expect(result.current.isUploading).toBe(false)
    expect(result.current.parsedData).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('[P0] should transition to uploading then success on successful upload', async () => {
    const parsedData = { skills: ['React'], experience: [], jobTitles: [] }
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 'r-1', fileName: 'resume.pdf', parsedData },
      }),
    })

    const { result } = renderHook(() => useResumeUpload())
    const file = new File(['pdf-content'], 'resume.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.upload(file)
    })

    expect(result.current.state).toBe('success')
    expect(result.current.isUploading).toBe(false)
    expect(result.current.parsedData).toEqual(parsedData)
    expect(result.current.resumeId).toBe('r-1')
    expect(result.current.error).toBeNull()
  })

  it('[P1] should set error state on API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { code: 400, message: 'Please upload a PDF file' },
      }),
    })

    const { result } = renderHook(() => useResumeUpload())
    const file = new File(['not-pdf'], 'test.txt', { type: 'text/plain' })

    await act(async () => {
      await result.current.upload(file)
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBe('Please upload a PDF file')
    expect(result.current.parsedData).toBeNull()
  })

  it('[P1] should set error state on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'))

    const { result } = renderHook(() => useResumeUpload())
    const file = new File(['pdf'], 'resume.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.upload(file)
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBe('Network error. Please try again.')
  })

  it('[P1] should reset to initial state', async () => {
    const parsedData = { skills: ['Go'], experience: [], jobTitles: [] }
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 'r-2', fileName: 'cv.pdf', parsedData },
      }),
    })

    const { result } = renderHook(() => useResumeUpload())
    const file = new File(['pdf'], 'cv.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.upload(file)
    })
    expect(result.current.state).toBe('success')

    act(() => {
      result.current.reset()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.parsedData).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.resumeId).toBeNull()
  })

  it('[P2] should send file as FormData', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 'r-3', fileName: 'test.pdf', parsedData: { skills: [], experience: [], jobTitles: [] } },
      }),
    })

    const { result } = renderHook(() => useResumeUpload())
    const file = new File(['pdf-data'], 'test.pdf', { type: 'application/pdf' })

    await act(async () => {
      await result.current.upload(file)
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/resume', {
      method: 'POST',
      body: expect.any(FormData),
    })
  })
})
