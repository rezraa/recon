// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const mockUseResumeRedirect = vi.fn()

vi.mock('@/hooks/useResume', () => ({
  useResumeRedirect: (...args: unknown[]) => mockUseResumeRedirect(...args),
}))

import Page from './page'

beforeEach(() => {
  mockReplace.mockClear()
  mockUseResumeRedirect.mockReset()
  mockUseResumeRedirect.mockReturnValue({
    data: { id: 'test', fileName: 'resume.pdf' },
    isLoading: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Root Page', () => {
  it('[P1] should render welcome message when resume exists', () => {
    render(<Page />)
    expect(screen.getByText('Recon')).toBeInTheDocument()
    expect(screen.getByText('Welcome back! Run discovery to find jobs.')).toBeInTheDocument()
  })

  it('[P1] should render Run Discovery Now button', () => {
    render(<Page />)
    expect(screen.getByText('Run Discovery Now')).toBeInTheDocument()
  })

  it('[P1] should show loading skeleton while checking resume', () => {
    mockUseResumeRedirect.mockReturnValue({ data: null, isLoading: true })
    render(<Page />)
    expect(screen.queryByText('Recon')).toBeNull()
  })

  it('[P1] should disable button and show Starting... while discovery runs', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    render(<Page />)
    const button = screen.getByText('Run Discovery Now')
    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByText('Starting...')).toBeInTheDocument()
    })
    expect((screen.getByText('Starting...') as HTMLButtonElement).disabled).toBe(true)
  })

  it('[P1] should show error message when discovery API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    )
    render(<Page />)
    fireEvent.click(screen.getByText('Run Discovery Now'))
    await waitFor(() => {
      expect(screen.getByText('Failed to start discovery. Please try again.')).toBeInTheDocument()
    })
  })

  it('[P1] should show error message on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
    render(<Page />)
    fireEvent.click(screen.getByText('Run Discovery Now'))
    await waitFor(() => {
      expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument()
    })
  })
})
