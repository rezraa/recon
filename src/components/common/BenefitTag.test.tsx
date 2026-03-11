// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BenefitTag, BenefitTagList, classifyBenefit, condenseBenefits } from './BenefitTag'

describe('classifyBenefit', () => {
  it('classifies health-related benefits', () => {
    expect(classifyBenefit('Comprehensive health insurance')?.short).toBe('Health')
    expect(classifyBenefit('Medical plan')?.short).toBe('Health')
    expect(classifyBenefit('Dental coverage')?.short).toBe('Health')
    expect(classifyBenefit('Vision benefits')?.short).toBe('Health')
  })

  it('classifies Unlimited PTO before generic PTO', () => {
    expect(classifyBenefit('Unlimited PTO and paid holidays')?.short).toBe('Unlimited PTO')
    expect(classifyBenefit('Unlimited vacation days')?.short).toBe('Unlimited PTO')
  })

  it('classifies generic PTO benefits', () => {
    expect(classifyBenefit('Paid vacation')?.short).toBe('PTO')
    expect(classifyBenefit('Paid time off')?.short).toBe('PTO')
    expect(classifyBenefit('Paid company holidays')?.short).toBe('PTO')
  })

  it('classifies 401k/retirement benefits', () => {
    expect(classifyBenefit('401k matching')?.short).toBe('401k')
    expect(classifyBenefit('Retirement plan')?.short).toBe('401k')
  })

  it('classifies equity benefits (before bonus)', () => {
    expect(classifyBenefit('Equity package')?.short).toBe('Equity')
    expect(classifyBenefit('Stock options')?.short).toBe('Equity')
    expect(classifyBenefit('RSU grants')?.short).toBe('Equity')
    expect(classifyBenefit('Competitive salary and meaningful equity package')?.short).toBe('Equity')
  })

  it('classifies bonus benefits', () => {
    expect(classifyBenefit('Annual bonus')?.short).toBe('Bonus')
    expect(classifyBenefit('Performance incentive')?.short).toBe('Bonus')
    expect(classifyBenefit('Sales commission')?.short).toBe('Bonus')
  })

  it('classifies parental benefits', () => {
    expect(classifyBenefit('Parental leave')?.short).toBe('Parental')
    expect(classifyBenefit('Maternity/paternity leave')?.short).toBe('Parental')
  })

  it('classifies pet benefits with word boundary', () => {
    expect(classifyBenefit('Pet insurance')?.short).toBe('Pet')
    expect(classifyBenefit('Dog-friendly office')?.short).toBe('Pet')
    // "competitive" contains "pet" but should NOT match (word boundary)
    expect(classifyBenefit('Competitive environment')).toBeNull()
  })

  it('returns null for unrecognized benefits', () => {
    expect(classifyBenefit('Free lunch')).toBeNull()
    expect(classifyBenefit('Team events and company meetups')).toBeNull()
  })

  it('returns correct color classes', () => {
    expect(classifyBenefit('Health insurance')?.colorClass).toContain('tag-health')
    expect(classifyBenefit('PTO')?.colorClass).toContain('tag-pto')
    expect(classifyBenefit('401k')?.colorClass).toContain('tag-401k')
    expect(classifyBenefit('Equity')?.colorClass).toContain('tag-equity')
    expect(classifyBenefit('Annual bonus')?.colorClass).toContain('tag-bonus')
    expect(classifyBenefit('Parental leave')?.colorClass).toContain('tag-parental')
    expect(classifyBenefit('Pet insurance')?.colorClass).toContain('tag-pet')
  })
})

describe('condenseBenefits', () => {
  it('deduplicates benefits into categories', () => {
    const result = condenseBenefits([
      'Comprehensive health benefits (Medical, Dental, Vision)',
      'Dental coverage',
      'Unlimited PTO and paid company holidays',
      'Competitive salary and meaningful equity package',
    ])
    const shorts = result.map(r => r.short)
    expect(shorts).toContain('Health')
    expect(shorts).toContain('Unlimited PTO')
    expect(shorts).toContain('Equity')
    // Health appears once despite two health-related inputs
    expect(shorts.filter(s => s === 'Health').length).toBe(1)
  })

  it('preserves original text in originals array', () => {
    const result = condenseBenefits([
      'Comprehensive health benefits',
      'Dental coverage',
    ])
    const health = result.find(r => r.short === 'Health')
    expect(health?.originals).toEqual([
      'Comprehensive health benefits',
      'Dental coverage',
    ])
  })

  it('drops unrecognized benefits (they go to overflow)', () => {
    const result = condenseBenefits([
      'Health insurance',
      'Free lunch',
      'Team events',
    ])
    expect(result.length).toBe(1)
    expect(result[0].short).toBe('Health')
  })

  it('handles empty array', () => {
    expect(condenseBenefits([])).toEqual([])
  })
})

describe('BenefitTag', () => {
  it('renders label text', () => {
    render(<BenefitTag label="Health" />)
    expect(screen.getByText('Health')).toBeDefined()
  })

  it('applies provided colorClass', () => {
    const { container } = render(<BenefitTag label="Health" colorClass="list-tag tag-health" />)
    const tag = container.firstElementChild as HTMLElement
    expect(tag.className).toContain('tag-health')
  })

  it('has title attribute for hover tooltip', () => {
    const { container } = render(<BenefitTag label="Health" title="Comprehensive health insurance, Dental" />)
    const tag = container.firstElementChild as HTMLElement
    expect(tag.getAttribute('title')).toBe('Comprehensive health insurance, Dental')
  })

  it('uses subtle rounding (not rounded-full)', () => {
    const { container } = render(<BenefitTag label="Health" />)
    const tag = container.firstElementChild as HTMLElement
    expect(tag.className).toContain('rounded')
    expect(tag.className).not.toContain('rounded-full')
  })
})

describe('BenefitTagList', () => {
  it('renders nothing for empty array', () => {
    const { container } = render(<BenefitTagList benefits={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing for null-like benefits', () => {
    const { container } = render(<BenefitTagList benefits={null as unknown as string[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when no benefits match known categories', () => {
    const { container } = render(<BenefitTagList benefits={['Free lunch', 'Team events']} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders condensed tags', () => {
    render(<BenefitTagList benefits={[
      'Comprehensive health benefits (Medical, Dental, Vision)',
      'Unlimited PTO and paid company holidays',
    ]} />)
    expect(screen.getByText('Health')).toBeDefined()
    expect(screen.getByText('Unlimited PTO')).toBeDefined()
  })

  it('shows overflow when condensed benefits exceed max', () => {
    render(<BenefitTagList benefits={[
      'Health insurance',
      'Unlimited PTO',
      '401k matching',
      'Equity grants',
      'Annual bonus',
      'Parental leave',
    ]} maxVisible={4} />)
    expect(screen.getByText('+2')).toBeDefined()
  })

  it('does not show overflow when at or under max', () => {
    render(<BenefitTagList benefits={['Health insurance', 'Unlimited PTO']} maxVisible={4} />)
    expect(screen.queryByText(/\+/)).toBeNull()
  })

  it('shows original text on hover via title attribute', () => {
    const { container } = render(<BenefitTagList benefits={[
      'Comprehensive health benefits (Medical, Dental, Vision)',
    ]} />)
    const tag = container.querySelector('span[title]') as HTMLElement
    expect(tag.getAttribute('title')).toBe('Comprehensive health benefits (Medical, Dental, Vision)')
  })
})
