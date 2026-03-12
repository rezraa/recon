// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobItem } from '@/hooks/useJobs'

import { JobCard } from './JobCard'

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

describe('JobCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders job title', () => {
    render(<JobCard job={makeJob()} onSelect={vi.fn()} />)
    expect(screen.getByText('Software Engineer')).toBeDefined()
  })

  it('renders company name', () => {
    render(<JobCard job={makeJob()} onSelect={vi.fn()} />)
    expect(screen.getByText('Acme Corp')).toBeDefined()
  })

  it('renders match score via ScoreRing', () => {
    render(<JobCard job={makeJob({ matchScore: 92 })} onSelect={vi.fn()} />)
    expect(screen.getByText('92')).toBeDefined()
  })

  it('renders partial score with dashed ScoreRing', () => {
    render(<JobCard job={makeJob({ matchScore: 45, partial: true })} onSelect={vi.fn()} />)
    expect(screen.getByText('~45')).toBeDefined()
  })

  it('renders -- for null match score', () => {
    render(<JobCard job={makeJob({ matchScore: null })} onSelect={vi.fn()} />)
    expect(screen.getByText('--')).toBeDefined()
  })

  it('renders salary range', () => {
    render(<JobCard job={makeJob({ salaryMin: 120000, salaryMax: 160000 })} onSelect={vi.fn()} />)
    expect(screen.getByText('$120k – $160k')).toBeDefined()
  })

  it('renders no salary text for missing salary', () => {
    const { container } = render(<JobCard job={makeJob({ salaryMin: null, salaryMax: null })} onSelect={vi.fn()} />)
    const salaryEl = container.querySelector('[data-testid="card-salary"]')
    expect(salaryEl).toBeNull()
  })

  it('renders remote work style', () => {
    render(<JobCard job={makeJob({ isRemote: true })} onSelect={vi.fn()} />)
    expect(screen.getByText(/Remote/)).toBeDefined()
  })

  it('renders location', () => {
    render(<JobCard job={makeJob({ location: 'New York, NY' })} onSelect={vi.fn()} />)
    expect(screen.getByText(/New York, NY/)).toBeDefined()
  })

  it('renders benefit tags with maxVisible=3', () => {
    render(<JobCard job={makeJob({
      benefits: ['Health insurance', '401k matching', 'Unlimited PTO', 'Stock options', 'Parental leave'],
    })} onSelect={vi.fn()} />)
    expect(screen.getByText('Health')).toBeDefined()
    expect(screen.getByText('Unlimited PTO')).toBeDefined()
    expect(screen.getByText('401k')).toBeDefined()
    // Overflow indicator
    expect(screen.getByText('+2')).toBeDefined()
  })

  it('handles null benefits gracefully', () => {
    render(<JobCard job={makeJob({ benefits: null })} onSelect={vi.fn()} />)
    expect(screen.getByText('Software Engineer')).toBeDefined()
  })

  it('calls onSelect and opens sourceUrl when card is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onSelect = vi.fn()
    render(<JobCard job={makeJob()} onSelect={onSelect} />)
    const card = screen.getByRole('article')
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-id' }))
    expect(openSpy).toHaveBeenCalledWith('https://example.com/job', '_blank', 'noopener,noreferrer')
  })

  it('does not open window when sourceUrl is null', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<JobCard job={makeJob({ sourceUrl: null })} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('article'))
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('triggers enrichment fetch for partial job on click', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    const onSelect = vi.fn()
    render(<JobCard job={makeJob({ partial: true, id: 'partial-1' })} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('article'))
    expect(fetchSpy).toHaveBeenCalledWith('/api/jobs/partial-1/enrich', { method: 'POST' })
  })

  it('does NOT trigger enrichment for non-partial job on click', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    render(<JobCard job={makeJob({ partial: false })} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('article'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('applies selected state class', () => {
    render(<JobCard job={makeJob()} onSelect={vi.fn()} selected />)
    const card = screen.getByRole('article')
    expect(card.className).toContain('border-l-2')
  })

  it('renders source attribution', () => {
    render(<JobCard job={makeJob({ sources: [{ name: 'indeed', external_id: '1', fetched_at: '' }] })} onSelect={vi.fn()} />)
    expect(screen.getByText('indeed')).toBeDefined()
  })

  it('renders discovered date', () => {
    render(<JobCard job={makeJob({ discoveredAt: new Date().toISOString() })} onSelect={vi.fn()} />)
    expect(screen.getByText(/Today/)).toBeDefined()
  })

  it('applies hover transition classes', () => {
    render(<JobCard job={makeJob()} onSelect={vi.fn()} />)
    const card = screen.getByRole('article')
    expect(card.className).toContain('transition-all')
  })

  it('decodes HTML entities in title', () => {
    render(<JobCard job={makeJob({ title: 'Senior PM Ad&#038;c' })} onSelect={vi.fn()} />)
    expect(screen.getByText('Senior PM Ad&c')).toBeDefined()
  })

  it('renders "Untitled" for null title', () => {
    render(<JobCard job={makeJob({ title: null })} onSelect={vi.fn()} />)
    expect(screen.getByText('Untitled')).toBeDefined()
  })
})
