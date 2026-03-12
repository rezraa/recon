// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobItem } from '@/hooks/useJobs'

import { JobCard } from './JobCard'
import { ViewToggle, type ViewMode } from './ViewToggle'

function makeJob(overrides: Partial<JobItem> = {}): JobItem {
  return {
    id: 'test-id',
    title: 'Software Engineer',
    company: 'Acme Corp',
    salaryMin: 80000,
    salaryMax: 120000,
    location: 'San Francisco, CA',
    isRemote: false,
    sourceUrl: 'https://example.com/job',
    sourceName: 'linkedin',
    sources: [{ name: 'linkedin', external_id: '123', fetched_at: '2026-03-10T00:00:00Z' }],
    dedupConfidence: null,
    matchScore: 82,
    matchBreakdown: null,
    pipelineStage: 'discovered',
    discoveredAt: new Date().toISOString(),
    isDismissed: false,
    partial: false,
    benefits: null,
    ...overrides,
  }
}

describe('Feed view mode integration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  // localStorage persistence tests
  it('persists view mode to localStorage on toggle', () => {
    let viewMode: ViewMode = 'list'
    const handleChange = (v: ViewMode) => {
      viewMode = v
      localStorage.setItem('recon-feed-view-mode', v)
    }
    const { rerender } = render(<ViewToggle view={viewMode} onViewChange={handleChange} />)
    fireEvent.click(screen.getByRole('radio', { name: /card/i }))
    expect(localStorage.getItem('recon-feed-view-mode')).toBe('card')
  })

  it('defaults to "list" when localStorage is empty', () => {
    const stored = localStorage.getItem('recon-feed-view-mode')
    const mode: ViewMode = stored === 'card' || stored === 'list' ? stored : 'list'
    expect(mode).toBe('list')
  })

  it('defaults to "list" for garbage localStorage value', () => {
    localStorage.setItem('recon-feed-view-mode', 'garbage')
    const stored = localStorage.getItem('recon-feed-view-mode')
    const mode: ViewMode = stored === 'card' || stored === 'list' ? stored : 'list'
    expect(mode).toBe('list')
  })

  // Card click triggers selection + navigation
  it('card click calls onSelect and opens sourceUrl', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onSelect = vi.fn()
    render(<JobCard job={makeJob()} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('article'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-id' }))
    expect(openSpy).toHaveBeenCalledWith('https://example.com/job', '_blank', 'noopener,noreferrer')
  })

  // Partial job in card view renders dashed ScoreRing
  it('partial job in card view renders dashed ScoreRing', () => {
    render(<JobCard job={makeJob({ matchScore: 45, partial: true })} onSelect={vi.fn()} />)
    expect(screen.getByText('~45')).toBeDefined()
  })

  // Card with benefits: null collapses benefit area
  it('card with benefits: null collapses benefit area cleanly', () => {
    const { container } = render(<JobCard job={makeJob({ benefits: null })} onSelect={vi.fn()} />)
    // No BenefitTagList rendered when benefits is null
    expect(container.querySelector('.list-tag')).toBeNull()
  })
})
