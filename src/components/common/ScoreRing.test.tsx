// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScoreRing } from './ScoreRing'

describe('ScoreRing', () => {
  it('should render solid green ring for score=80, partial=false', () => {
    const { container } = render(<ScoreRing score={80} />)
    const svg = container.querySelector('svg')!
    const scoreCircle = svg.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('stroke')).toBe('#22c55e')
    expect(scoreCircle.getAttribute('stroke-dasharray')).not.toBe('6 3')
    expect(svg.querySelector('text')!.textContent).toBe('80')
  })

  it('should render dashed yellow pulsing ring for partial=true', () => {
    const { container } = render(<ScoreRing score={45} partial />)
    const svg = container.querySelector('svg')!
    const scoreCircle = svg.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('stroke')).toBe('#facc15')
    expect(scoreCircle.getAttribute('stroke-dasharray')).toBe('6 3')
  })

  it('should render ~ prefix when partial', () => {
    const { container } = render(<ScoreRing score={45} partial />)
    const text = container.querySelector('text')!
    expect(text.textContent).toBe('~45')
  })

  it('should not render ~ prefix when not partial', () => {
    const { container } = render(<ScoreRing score={72} />)
    const text = container.querySelector('text')!
    expect(text.textContent).toBe('72')
  })

  it('should use size prop for SVG dimensions', () => {
    const { container } = render(<ScoreRing score={50} size={48} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('48')
    expect(svg.getAttribute('height')).toBe('48')
  })

  it('should default size to 36', () => {
    const { container } = render(<ScoreRing score={50} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('36')
    expect(svg.getAttribute('height')).toBe('36')
  })

  it('should render red color for score < 30', () => {
    const { container } = render(<ScoreRing score={20} />)
    const scoreCircle = container.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('stroke')).toBe('#ef4444')
  })

  it('should render orange color for score 30-49', () => {
    const { container } = render(<ScoreRing score={35} />)
    const scoreCircle = container.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('stroke')).toBe('#f97316')
  })

  it('should render yellow color for score 50-69', () => {
    const { container } = render(<ScoreRing score={55} />)
    const scoreCircle = container.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('stroke')).toBe('#eab308')
  })

  it('should render green color for score 70-84', () => {
    const { container } = render(<ScoreRing score={75} />)
    const scoreCircle = container.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('stroke')).toBe('#22c55e')
  })

  it('should render emerald color for score >= 85', () => {
    const { container } = render(<ScoreRing score={90} />)
    const scoreCircle = container.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('stroke')).toBe('#10b981')
  })

  it('should have pulse animation style for partial ring', () => {
    const { container } = render(<ScoreRing score={45} partial />)
    const scoreCircle = container.querySelectorAll('circle')[1]
    expect(scoreCircle.getAttribute('style')).toContain('pulse-glow')
  })

  it('should have white text fill for full score', () => {
    const { container } = render(<ScoreRing score={80} />)
    const text = container.querySelector('text')!
    expect(text.getAttribute('fill')).toBe('white')
  })

  it('should have muted text fill for partial score', () => {
    const { container } = render(<ScoreRing score={45} partial />)
    const text = container.querySelector('text')!
    expect(text.getAttribute('fill')).toBe('#d1d5db')
  })

  it('should have aria-label for accessibility', () => {
    const { container: full } = render(<ScoreRing score={80} />)
    expect(full.querySelector('svg')!.getAttribute('aria-label')).toBe('Score: 80')

    const { container: partial } = render(<ScoreRing score={45} partial />)
    expect(partial.querySelector('svg')!.getAttribute('aria-label')).toBe('Approximate score: 45')
  })
})
