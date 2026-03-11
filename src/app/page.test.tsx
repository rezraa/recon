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

  it('[P1] should auto-trigger discovery when feed is empty', async () => {
    // Mock fetch for both /api/discovery/active (on mount) and /api/discovery/run (auto-trigger)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/discovery/active')) {
        return new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ data: { runId: 'run-auto' } }), { status: 202, headers: { 'Content-Type': 'application/json' } })
    })
    render(<Page />)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/discovery/run', { method: 'POST' })
    })
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
          sourceName: 'himalayas',
          sources: [{ name: 'himalayas', external_id: 'ext-1', fetched_at: '2026-03-09' }],
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
          sourceName: 'himalayas',
          sources: [
            { name: 'himalayas', external_id: 'ext-1', fetched_at: '2026-03-09' },
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
          sourceName: 'himalayas',
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

  it('[P1] should start discovery via Run Discovery button', async () => {
    // Need jobs so AutoDiscovery doesn't fire and the Run Discovery button appears
    mockUseJobs.mockReturnValue({
      jobs: [{ id: 'j1', title: 'Dev', company: 'Co', salaryMin: null, salaryMax: null, matchScore: 50, sourceName: 'himalayas', sources: [], discoveredAt: '2026-03-09T00:00:00Z', sourceUrl: null }],
      total: 1,
      isLoading: false,
      mutate: vi.fn(),
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/discovery/active')) {
        return new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ data: { runId: 'run-1' } }), { status: 202, headers: { 'Content-Type': 'application/json' } })
    })
    render(<Page />)
    const button = screen.getByText('Run Discovery')
    fireEvent.click(button)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/discovery/run', { method: 'POST' })
    })
  })

  it('[P1] should show error when discovery fails', async () => {
    mockUseJobs.mockReturnValue({
      jobs: [{ id: 'j1', title: 'Dev', company: 'Co', salaryMin: null, salaryMax: null, matchScore: 50, sourceName: 'himalayas', sources: [], discoveredAt: '2026-03-09T00:00:00Z', sourceUrl: null }],
      total: 1,
      isLoading: false,
      mutate: vi.fn(),
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/discovery/active')) {
        return new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('error', { status: 500 })
    })
    render(<Page />)
    const button = screen.getByText('Run Discovery')
    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByText('Failed to start discovery. Please try again.')).toBeInTheDocument()
    })
  })
})
