// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SourcesStep } from '@/components/onboarding/SourcesStep'

describe('SourcesStep — edge cases', () => {
  it('[P2] should reset validation state when key is modified after successful validation', async () => {
    // Given: validation succeeds
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { valid: true } }), { status: 200 }),
      ),
    )

    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')

    // When: user validates a key
    fireEvent.change(apiKeyInput, { target: { value: 'valid-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeInTheDocument()
    })

    // When: user modifies the key
    fireEvent.change(apiKeyInput, { target: { value: 'valid-key-modified' } })

    // Then: "Valid" indicator should be gone, Validate button re-enabled
    expect(screen.queryByText('Valid')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validate' })).not.toBeDisabled()
  })

  it('[P2] should clear error when key is modified after failed validation', async () => {
    // Given: validation fails
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 400, message: 'Invalid API key — please check and try again' } }),
          { status: 400 },
        ),
      ),
    )

    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')

    // When: user validates and it fails
    fireEvent.change(apiKeyInput, { target: { value: 'bad-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => {
      expect(screen.getByText(/Invalid API key/)).toBeInTheDocument()
    })

    // When: user modifies the key
    fireEvent.change(apiKeyInput, { target: { value: 'new-key' } })

    // Then: error should be cleared
    expect(screen.queryByText(/Invalid API key/)).not.toBeInTheDocument()
  })

  it('[P2] should show network error when fetch throws', async () => {
    // Given: network error (fetch rejects)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    fireEvent.change(apiKeyInput, { target: { value: 'some-key' } })

    // When: user clicks Validate
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    // Then: network error message shown
    await waitFor(() => {
      expect(screen.getByText(/Unable to validate/)).toBeInTheDocument()
    })
  })

  it('[P2] should not attempt validation with empty/whitespace key', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')

    // Given: only whitespace entered
    fireEvent.change(apiKeyInput, { target: { value: '   ' } })

    // Then: Validate button should be disabled
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()
  })
})
