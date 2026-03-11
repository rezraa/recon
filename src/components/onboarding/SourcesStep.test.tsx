// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SourcesStep } from './SourcesStep'

describe('SourcesStep', () => {
  it('[P1] should render all 6 sources from registry', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByText('Himalayas')).toBeInTheDocument()
    expect(screen.getByText('The Muse')).toBeInTheDocument()
    expect(screen.getByText('Jobicy')).toBeInTheDocument()
    expect(screen.getByText('Remote OK')).toBeInTheDocument()
    expect(screen.getByText('RSS Feeds')).toBeInTheDocument()
    expect(screen.getByText('Serply')).toBeInTheDocument()
  })

  it('[P1] should render source type headings', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByText('Open Sources (no API key needed)')).toBeInTheDocument()
    expect(screen.getByText('API Key Required')).toBeInTheDocument()
  })

  it('[P1] should call onValidChange with true on mount', () => {
    const onValidChange = vi.fn()
    render(<SourcesStep onValidChange={onValidChange} />)
    expect(onValidChange).toHaveBeenCalledWith(true)
  })

  it('[P1] should render source descriptions from registry', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByText('Remote jobs across industries')).toBeInTheDocument()
    expect(screen.getByText('Curated US job listings')).toBeInTheDocument()
    expect(screen.getByText('Remote jobs worldwide')).toBeInTheDocument()
    expect(screen.getByText('LinkedIn, Indeed, and custom job feeds')).toBeInTheDocument()
    expect(screen.getByText('Remote-first jobs worldwide')).toBeInTheDocument()
    expect(screen.getByText('Google for Jobs search')).toBeInTheDocument()
  })

  it('[P1] should render Enabled indicator for open sources', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const enabledIndicators = screen.getAllByText('Enabled')
    expect(enabledIndicators).toHaveLength(5)
  })

  it('[P1] should render letter avatars (not images)', () => {
    const { container } = render(<SourcesStep onValidChange={vi.fn()} />)
    // No img tags should exist
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(0)
    // Letter avatars should be present (first letter in circle)
    expect(screen.getByText('H')).toBeInTheDocument() // Himalayas
    expect(screen.getByText('T')).toBeInTheDocument() // The Muse
    expect(screen.getByText('J')).toBeInTheDocument() // Jobicy
    expect(screen.getByText('S')).toBeInTheDocument() // Serply
  })

  it('[P2] should render API key input for key-required sources', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    expect(apiKeyInput).toBeInTheDocument()
  })

  it('[P2] should render Validate button for key-required sources', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument()
  })

  it('[P2] should disable Validate button when no key entered', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const validateBtn = screen.getByRole('button', { name: 'Validate' })
    expect(validateBtn).toBeDisabled()
  })

  it('[P2] should enable Validate button when key is entered', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test-key' } })
    const validateBtn = screen.getByRole('button', { name: 'Validate' })
    expect(validateBtn).not.toBeDisabled()
  })

  it('[P2] should show success state after valid key validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { valid: true } }), { status: 200 }),
      ),
    )

    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    fireEvent.change(apiKeyInput, { target: { value: 'valid-key' } })

    const validateBtn = screen.getByRole('button', { name: 'Validate' })
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeInTheDocument()
    })
  })

  it('[P2] should show error state after invalid key validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 400, message: 'Invalid API key \u2014 please check and try again' } }),
          { status: 400 },
        ),
      ),
    )

    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key')
    fireEvent.change(apiKeyInput, { target: { value: 'bad-key' } })

    const validateBtn = screen.getByRole('button', { name: 'Validate' })
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(screen.getByText(/Invalid API key/)).toBeInTheDocument()
    })
  })

  it('[P2] should render "Get Free Key" link for Serply', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const link = screen.getByText('Get Free Key')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', 'https://serply.io')
    expect(link.closest('a')).toHaveAttribute('target', '_blank')
  })

  it('[P2] should render Skip for now link when onSkip provided', () => {
    const onSkip = vi.fn()
    render(<SourcesStep onValidChange={vi.fn()} onSkip={onSkip} />)
    const skipLink = screen.getByText('Skip for now')
    expect(skipLink).toBeInTheDocument()
    fireEvent.click(skipLink)
    expect(onSkip).toHaveBeenCalled()
  })

  it('[P2] should not render Skip for now link when onSkip not provided', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.queryByText('Skip for now')).not.toBeInTheDocument()
  })

  it('[P2] should render instructional text about starting discovery', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByText(/Click.*Start Discovery.*to begin finding jobs/)).toBeInTheDocument()
  })
})
