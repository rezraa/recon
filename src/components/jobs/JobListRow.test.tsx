// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobItem } from '@/hooks/useJobs'

import { JobListRow } from './JobListRow'

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

function renderRow(overrides: Partial<JobItem> = {}) {
  return render(
    <table>
      <tbody>
        <JobListRow job={makeJob(overrides)} />
      </tbody>
    </table>,
  )
}

describe('JobListRow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('triggers enrichment fetch when clicking a partial job link', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    renderRow({ partial: true, id: 'partial-job-1', sourceUrl: 'https://linkedin.com/jobs/view/123' })

    const link = screen.getByText('Software Engineer')
    fireEvent.click(link)

    expect(fetchSpy).toHaveBeenCalledWith('/api/jobs/partial-job-1/enrich', { method: 'POST' })
  })

  it('does NOT trigger enrichment when clicking a non-partial job link', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    renderRow({ partial: false, sourceUrl: 'https://example.com/job' })

    const link = screen.getByText('Software Engineer')
    fireEvent.click(link)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders job title', () => {
    renderRow({ title: 'Frontend Developer' })
    expect(screen.getByText('Frontend Developer')).toBeDefined()
  })

  it('renders company name', () => {
    renderRow({ company: 'BigCo' })
    expect(screen.getByText('BigCo')).toBeDefined()
  })

  it('renders match score via ScoreRing', () => {
    renderRow({ matchScore: 92 })
    expect(screen.getByText('92')).toBeDefined()
  })

  it('renders partial score with ~ prefix via ScoreRing', () => {
    renderRow({ matchScore: 45, partial: true })
    expect(screen.getByText('~45')).toBeDefined()
  })

  it('renders -- for null match score', () => {
    renderRow({ matchScore: null })
    expect(screen.getByText('--')).toBeDefined()
  })

  it('renders salary range in mono font with green color', () => {
    const { container } = renderRow({ salaryMin: 80000, salaryMax: 120000 })
    const salaryEl = screen.getByText('$80k – $120k')
    expect(salaryEl).toBeDefined()
    expect(salaryEl.className).toContain('font-mono')
    expect(salaryEl.className).toContain('--tag-salary')
  })

  it('renders blank for missing salary', () => {
    const { container } = renderRow({ salaryMin: 0, salaryMax: 0 })
    const salaryCells = container.querySelectorAll('td')
    // Salary is the 3rd cell (index 2) — should be empty
    expect(salaryCells[2]?.textContent).toBe('')
  })

  it('renders blank for null salary', () => {
    const { container } = renderRow({ salaryMin: null, salaryMax: null })
    const salaryCells = container.querySelectorAll('td')
    expect(salaryCells[2]?.textContent).toBe('')
  })

  it('renders salary with min only', () => {
    renderRow({ salaryMin: 100000, salaryMax: 0 })
    expect(screen.getByText('$100k+')).toBeDefined()
  })

  it('renders salary with max only', () => {
    renderRow({ salaryMin: 0, salaryMax: 150000 })
    expect(screen.getByText('Up to $150k')).toBeDefined()
  })

  it('renders location', () => {
    renderRow({ location: 'New York, NY' })
    expect(screen.getByText('New York, NY')).toBeDefined()
  })

  it('renders work style with icon for remote jobs', () => {
    const { container } = renderRow({ isRemote: true })
    expect(screen.getByText('Remote')).toBeDefined()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders on-site work style for non-remote jobs', () => {
    renderRow({ isRemote: false })
    expect(screen.getByText('On-site')).toBeDefined()
  })

  it('renders hybrid work style when location contains hybrid', () => {
    renderRow({ isRemote: false, location: 'New York, NY (Hybrid)' })
    expect(screen.getByText('Hybrid')).toBeDefined()
  })

  it('renders condensed benefit tags', () => {
    renderRow({ benefits: ['Health insurance', '401k matching'] })
    expect(screen.getByText('Health')).toBeDefined()
    expect(screen.getByText('401k')).toBeDefined()
  })

  it('handles null benefits gracefully', () => {
    renderRow({ benefits: null })
    // Should render without crashing
    expect(screen.getByText('Software Engineer')).toBeDefined()
  })

  it('renders source attribution', () => {
    renderRow({ sources: [{ name: 'indeed', external_id: '1', fetched_at: '' }] })
    expect(screen.getByText('indeed')).toBeDefined()
  })

  it('renders multi-source attribution', () => {
    renderRow({
      sources: [
        { name: 'indeed', external_id: '1', fetched_at: '' },
        { name: 'linkedin', external_id: '2', fetched_at: '' },
      ],
    })
    expect(screen.getByText('Found on 2 sources')).toBeDefined()
  })

  it('renders discovered date as Today for current date', () => {
    renderRow({ discoveredAt: new Date().toISOString() })
    expect(screen.getByText('Today')).toBeDefined()
  })

  it('renders title as link when sourceUrl exists', () => {
    renderRow({ sourceUrl: 'https://example.com/job', title: 'Test Job' })
    const link = screen.getByText('Test Job')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('https://example.com/job')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('renders title as span when no sourceUrl', () => {
    renderRow({ sourceUrl: null, title: 'Test Job' })
    const el = screen.getByText('Test Job')
    expect(el.tagName).toBe('SPAN')
  })

  it('applies hover transition class', () => {
    const { container } = renderRow()
    const row = container.querySelector('tr')
    expect(row?.className).toContain('hover:bg-muted/50')
    expect(row?.className).toContain('transition-colors')
  })

  it('applies selected class when selected prop is true', () => {
    const { container } = render(
      <table>
        <tbody>
          <JobListRow job={makeJob()} selected />
        </tbody>
      </table>,
    )
    const row = container.querySelector('tr')
    expect(row?.className).toContain('selected')
  })

  it('renders "Untitled" for null title', () => {
    renderRow({ title: null })
    expect(screen.getByText('Untitled')).toBeDefined()
  })

  it('renders dash for null company', () => {
    renderRow({ company: null })
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('decodes HTML entities in title', () => {
    renderRow({ title: 'Senior PM Ad&#038;c Luxury &#038; Lifestyle' })
    expect(screen.getByText('Senior PM Ad&c Luxury & Lifestyle')).toBeDefined()
  })

  it('decodes &amp; in company name', () => {
    renderRow({ company: 'Johnson &amp; Johnson' })
    expect(screen.getByText('Johnson & Johnson')).toBeDefined()
  })
})
