// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SourcesStep } from '@/components/onboarding/SourcesStep'

describe('SourcesStep — saveApiKeys integration', () => {
  afterEach(() => {
    delete window.__saveSourceApiKeys
    vi.restoreAllMocks()
  })

  it('[P1] should expose window.__saveSourceApiKeys on mount', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(window.__saveSourceApiKeys).toBeDefined()
    expect(typeof window.__saveSourceApiKeys).toBe('function')
  })

  it('[P1] should clean up window.__saveSourceApiKeys on unmount', () => {
    const { unmount } = render(<SourcesStep onValidChange={vi.fn()} />)
    expect(window.__saveSourceApiKeys).toBeDefined()
    unmount()
    expect(window.__saveSourceApiKeys).toBeUndefined()
  })

  it('[P1] should call PUT /api/sources/[name]/config for validated keys', async () => {
    // Given: validation succeeds
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { valid: true } }), { status: 200 }),
      )
      // Then: saveApiKeys calls PUT
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { name: 'serply', isConfigured: true } }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<SourcesStep onValidChange={vi.fn()} />)

    // When: user enters key and validates
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    fireEvent.change(apiKeyInput, { target: { value: 'valid-serply-key' } })
    const validateBtn = screen.getByRole('button', { name: 'Validate' })
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeInTheDocument()
    })

    // When: wizard calls saveApiKeys (wrap in act to flush pending effects)
    await act(async () => {
      await window.__saveSourceApiKeys!()
    })

    // Then: PUT was called with the validated key
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const putCall = fetchMock.mock.calls[1]
    expect(putCall[0]).toBe('/api/sources/serply/config')
    expect(putCall[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ apiKey: 'valid-serply-key' }),
      }),
    )
  })

  it('[P1] should NOT call PUT for keys that were not validated', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<SourcesStep onValidChange={vi.fn()} />)

    // Given: user enters key but does NOT click Validate
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    fireEvent.change(apiKeyInput, { target: { value: 'unvalidated-key' } })

    // When: wizard calls saveApiKeys
    await window.__saveSourceApiKeys!()

    // Then: no PUT calls made (only no validation call either)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('[P1] should NOT call PUT for keys that failed validation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 400, message: 'Invalid API key' } }),
          { status: 400 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<SourcesStep onValidChange={vi.fn()} />)

    // Given: user enters key and validation fails
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    fireEvent.change(apiKeyInput, { target: { value: 'bad-key' } })
    const validateBtn = screen.getByRole('button', { name: 'Validate' })
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(screen.getByText(/Invalid API key/)).toBeInTheDocument()
    })

    // When: wizard calls saveApiKeys
    await window.__saveSourceApiKeys!()

    // Then: only the validation POST was called, no PUT
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sources/validate')
  })

  // Future consideration: if this tool ever becomes multi-user or the wizard
  // allows rapid re-clicks, concurrent saveApiKeys calls could fire duplicate
  // PUT requests. Low risk for single-user localhost, but worth guarding if
  // the architecture changes.
  it.todo('[P3] should handle concurrent saveApiKeys calls without duplicate PUTs')
})
