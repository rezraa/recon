// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ViewToggle } from './ViewToggle'

describe('ViewToggle', () => {
  it('renders list and card toggle buttons', () => {
    render(<ViewToggle view="list" onViewChange={vi.fn()} />)
    expect(screen.getByRole('radiogroup')).toBeDefined()
    expect(screen.getByRole('radio', { name: /list/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /card/i })).toBeDefined()
  })

  it('marks list as active when view is "list"', () => {
    render(<ViewToggle view="list" onViewChange={vi.fn()} />)
    const listBtn = screen.getByRole('radio', { name: /list/i })
    const cardBtn = screen.getByRole('radio', { name: /card/i })
    expect(listBtn.getAttribute('aria-checked')).toBe('true')
    expect(cardBtn.getAttribute('aria-checked')).toBe('false')
  })

  it('marks card as active when view is "card"', () => {
    render(<ViewToggle view="card" onViewChange={vi.fn()} />)
    const listBtn = screen.getByRole('radio', { name: /list/i })
    const cardBtn = screen.getByRole('radio', { name: /card/i })
    expect(listBtn.getAttribute('aria-checked')).toBe('false')
    expect(cardBtn.getAttribute('aria-checked')).toBe('true')
  })

  it('calls onViewChange with "card" when card button is clicked', () => {
    const onChange = vi.fn()
    render(<ViewToggle view="list" onViewChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: /card/i }))
    expect(onChange).toHaveBeenCalledWith('card')
  })

  it('calls onViewChange with "list" when list button is clicked', () => {
    const onChange = vi.fn()
    render(<ViewToggle view="card" onViewChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: /list/i }))
    expect(onChange).toHaveBeenCalledWith('list')
  })

  it('has accessible aria-label on radiogroup', () => {
    render(<ViewToggle view="list" onViewChange={vi.fn()} />)
    const group = screen.getByRole('radiogroup')
    expect(group.getAttribute('aria-label')).toBe('View mode')
  })

  it('applies highlighted background to active button', () => {
    const { container } = render(<ViewToggle view="list" onViewChange={vi.fn()} />)
    const listBtn = screen.getByRole('radio', { name: /list/i })
    expect(listBtn.className).toContain('bg-muted')
  })
})
