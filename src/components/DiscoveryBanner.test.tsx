// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DiscoveryBanner } from './DiscoveryBanner'

// Mock the hook
vi.mock('@/hooks/useDiscoveryStatus', () => ({
  useDiscoveryStatus: vi.fn((runId: string | null) => {
    if (!runId) return { status: null, sourcesCompleted: 0, sourcesTotal: 0, listingsNew: 0, isComplete: false }
    if (runId === 'run-fetching') return { status: 'fetching', sourcesCompleted: 2, sourcesTotal: 5, listingsNew: 0, isComplete: false }
    if (runId === 'run-scoring') return { status: 'scoring', sourcesCompleted: 5, sourcesTotal: 5, listingsNew: 0, isComplete: false }
    if (runId === 'run-done') return { status: 'completed', sourcesCompleted: 5, sourcesTotal: 5, listingsNew: 42, isComplete: true }
    if (runId === 'run-failed') return { status: 'failed', sourcesCompleted: 0, sourcesTotal: 3, listingsNew: 0, isComplete: true }
    return { status: null, sourcesCompleted: 0, sourcesTotal: 0, listingsNew: 0, isComplete: false }
  }),
}))

describe('DiscoveryBanner', () => {
  it('[P1] should render nothing when runId is null', () => {
    const { container } = render(<DiscoveryBanner runId={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('[P1] should show fetching state with progress', () => {
    render(<DiscoveryBanner runId="run-fetching" />)
    expect(screen.getByText('Finding new opportunities for you')).toBeDefined()
    expect(screen.getByText(/2 of 5 sources checked/)).toBeDefined()
  })

  it('[P1] should show scoring state', () => {
    render(<DiscoveryBanner runId="run-scoring" />)
    expect(screen.getByText('Matching jobs to your profile')).toBeDefined()
    expect(screen.getByText(/Analyzing and matching each listing/)).toBeDefined()
  })

  it('[P1] should show completed state with listings count', () => {
    render(<DiscoveryBanner runId="run-done" />)
    expect(screen.getByText('Discovery complete.')).toBeDefined()
    expect(screen.getByText('Found 42 new listings.')).toBeDefined()
  })

  it('[P1] should show failed state', () => {
    render(<DiscoveryBanner runId="run-failed" />)
    expect(screen.getByText('Discovery failed.')).toBeDefined()
  })

  it('[P1] should call onComplete when discovery finishes', () => {
    const onComplete = vi.fn()
    render(<DiscoveryBanner runId="run-done" onComplete={onComplete} />)
    expect(onComplete).toHaveBeenCalled()
  })
})
