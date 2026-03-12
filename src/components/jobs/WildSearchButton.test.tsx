// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WildSearchButton } from './WildSearchButton'

describe('WildSearchButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should be hidden when query is empty', () => {
    const { container } = render(<WildSearchButton query="" />)
    expect(container.firstChild).toBeNull()
  })

  it('should be hidden when query is whitespace', () => {
    const { container } = render(<WildSearchButton query="   " />)
    expect(container.firstChild).toBeNull()
  })

  it('should show button with query text when search bar has content', () => {
    render(<WildSearchButton query="SDET" />)
    expect(screen.getByText(/Search in the Wild/)).toBeDefined()
  })

  it('should show searching state when clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { found: 3 } }), { status: 200 }),
    )

    render(<WildSearchButton query="SDET" />)

    await act(async () => {
      fireEvent.click(screen.getByText(/Search in the Wild/))
    })

    // After the fetch resolves, should show found state
    expect(screen.getByText(/Found 3 new results/)).toBeDefined()
  })

  it('should show result count after search completes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { found: 12 } }), { status: 200 }),
    )

    render(<WildSearchButton query="React Developer" />)

    await act(async () => {
      fireEvent.click(screen.getByText(/Search in the Wild/))
    })

    expect(screen.getByText(/Found 12 new results/)).toBeDefined()
  })

  it('should call onSearchComplete callback after search', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { found: 5 } }), { status: 200 }),
    )

    const onComplete = vi.fn()
    render(<WildSearchButton query="SDET" onSearchComplete={onComplete} />)

    await act(async () => {
      fireEvent.click(screen.getByText(/Search in the Wild/))
    })

    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('should handle singular result text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { found: 1 } }), { status: 200 }),
    )

    render(<WildSearchButton query="SDET" />)

    await act(async () => {
      fireEvent.click(screen.getByText(/Search in the Wild/))
    })

    expect(screen.getByText(/Found 1 new result$/)).toBeDefined()
  })

  it('should recover to idle on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    render(<WildSearchButton query="SDET" />)

    await act(async () => {
      fireEvent.click(screen.getByText(/Search in the Wild/))
    })

    // Should return to idle state
    expect(screen.getByText(/Search in the Wild/)).toBeDefined()
  })
})
