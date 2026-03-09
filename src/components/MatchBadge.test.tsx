// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MatchBadge } from './MatchBadge'

describe('MatchBadge', () => {
  it('[P1] should render score with percentage', () => {
    render(<MatchBadge score={85} />)
    expect(screen.getByText('85%')).toBeDefined()
  })

  it('[P1] should apply high variant for score >= 80', () => {
    const { container } = render(<MatchBadge score={92} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('match-high')
  })

  it('[P1] should apply medium variant for score 50-79', () => {
    const { container } = render(<MatchBadge score={65} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('match-medium')
  })

  it('[P1] should apply low variant for score < 50', () => {
    const { container } = render(<MatchBadge score={30} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('match-low')
  })

  it('[P1] should show -- for null score', () => {
    render(<MatchBadge score={null} />)
    expect(screen.getByText('--')).toBeDefined()
  })

  it('[P2] should use mono font class', () => {
    const { container } = render(<MatchBadge score={80} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('font-mono')
  })

  it('[P2] should apply boundary values correctly', () => {
    const { container: c80 } = render(<MatchBadge score={80} />)
    expect((c80.firstElementChild as HTMLElement).className).toContain('match-high')

    const { container: c50 } = render(<MatchBadge score={50} />)
    expect((c50.firstElementChild as HTMLElement).className).toContain('match-medium')

    const { container: c49 } = render(<MatchBadge score={49} />)
    expect((c49.firstElementChild as HTMLElement).className).toContain('match-low')
  })
})
