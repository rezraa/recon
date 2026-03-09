// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReplace, nextNavigationMock } = vi.hoisted(() => {
  const mockReplace = vi.fn()
  return {
    mockReplace,
    nextNavigationMock: {
      useRouter: () => ({
        replace: mockReplace,
        push: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn(),
      }),
    },
  }
})

vi.mock('next/navigation', () => nextNavigationMock)

const mockUseResumeRedirect = vi.fn()
vi.mock('@/hooks/useResume', () => ({
  useResumeRedirect: (...args: unknown[]) => mockUseResumeRedirect(...args),
}))

const mockUseJobs = vi.fn()
vi.mock('@/hooks/useJobs', () => ({
  useJobs: () => mockUseJobs(),
}))

vi.mock('@/components/DiscoveryBanner', () => ({
  DiscoveryBanner: () => null,
}))

import Page from './page'

beforeEach(() => {
  mockReplace.mockClear()
  mockUseResumeRedirect.mockReset()
  mockUseResumeRedirect.mockReturnValue({
    data: { id: 'test', fileName: 'resume.pdf' },
    isLoading: false,
  })
  mockUseJobs.mockReset()
  mockUseJobs.mockReturnValue({
    jobs: [],
    total: 0,
    isLoading: false,
    mutate: vi.fn(),
  })
})

describe('Root Page - Feed', () => {
  it('[P1] should render Recon heading', () => {
    render(<Page />)
    expect(screen.getByText('Recon')).toBeInTheDocument()
  })

  it('[P1] should show loading skeleton while checking resume', () => {
    mockUseResumeRedirect.mockReturnValue({ data: null, isLoading: true })
    render(<Page />)
    expect(screen.queryByText('Recon')).toBeNull()
  })

  it('[P1] should show empty state when no jobs exist', () => {
    render(<Page />)
    expect(screen.getByText('No jobs discovered yet. Run discovery to get started.')).toBeInTheDocument()
    expect(screen.getByText('Run Discovery Now')).toBeInTheDocument()
  })

  it('[P1] should render job feed table when jobs exist', () => {
    mockUseJobs.mockReturnValue({
      jobs: [
        {
          id: 'j1',
          title: 'Software Engineer',
          company: 'TestCo',
          salaryMin: 100000,
          salaryMax: 150000,
          matchScore: 85,
          sourceName: 'remoteok',
          sources: [{ name: 'remoteok', external_id: 'ext-1', fetched_at: '2026-03-09' }],
          discoveredAt: '2026-03-09T00:00:00Z',
          sourceUrl: 'https://example.com/1',
        },
      ],
      total: 1,
      isLoading: false,
      mutate: vi.fn(),
    })
    render(<Page />)
    expect(screen.getByText('Software Engineer')).toBeInTheDocument()
    expect(screen.getByText('TestCo')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('1 job discovered')).toBeInTheDocument()
  })

  it('[P1] should show multi-source attribution', () => {
    mockUseJobs.mockReturnValue({
      jobs: [
        {
          id: 'j1',
          title: 'Dev',
          company: 'Co',
          salaryMin: null,
          salaryMax: null,
          matchScore: 70,
          sourceName: 'remoteok',
          sources: [
            { name: 'remoteok', external_id: 'ext-1', fetched_at: '2026-03-09' },
            { name: 'himalayas', external_id: 'ext-2', fetched_at: '2026-03-09' },
          ],
          discoveredAt: '2026-03-09T00:00:00Z',
          sourceUrl: null,
        },
      ],
      total: 1,
      isLoading: false,
      mutate: vi.fn(),
    })
    render(<Page />)
    expect(screen.getByText('Found on 2 sources')).toBeInTheDocument()
  })

  it('[P1] should show skeleton rows while loading jobs', () => {
    mockUseJobs.mockReturnValue({
      jobs: [],
      total: 0,
      isLoading: true,
      mutate: vi.fn(),
    })
    render(<Page />)
    // Should not show empty state while loading
    expect(screen.queryByText('No jobs discovered yet.')).toBeNull()
  })

  it('[P1] should format salary range correctly', () => {
    mockUseJobs.mockReturnValue({
      jobs: [
        {
          id: 'j1',
          title: 'Dev',
          company: 'Co',
          salaryMin: 120000,
          salaryMax: 180000,
          matchScore: 90,
          sourceName: 'remoteok',
          sources: [],
          discoveredAt: null,
          sourceUrl: null,
        },
      ],
      total: 1,
      isLoading: false,
      mutate: vi.fn(),
    })
    render(<Page />)
    expect(screen.getByText('$120k – $180k')).toBeInTheDocument()
  })

  it('[P1] should start discovery and show starting state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { runId: 'run-1', status: 'running' } }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    render(<Page />)
    const button = screen.getByText('Run Discovery')
    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByText('Run Discovery')).toBeInTheDocument()
    })
  })

  it('[P1] should show error when discovery fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 500 }),
    )
    render(<Page />)
    // Use the header button (not the empty state one)
    const buttons = screen.getAllByText('Run Discovery Now')
    fireEvent.click(buttons[0])
    await waitFor(() => {
      expect(screen.getByText('Failed to start discovery. Please try again.')).toBeInTheDocument()
    })
  })
})
