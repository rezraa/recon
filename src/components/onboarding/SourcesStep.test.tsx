// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SourcesStep } from './SourcesStep'

describe('SourcesStep', () => {
  it('[P1] should render all 4 sources', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByText('RemoteOK')).toBeInTheDocument()
    expect(screen.getByText('Jobicy')).toBeInTheDocument()
    expect(screen.getByText('Arbeitnow')).toBeInTheDocument()
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

  it('[P1] should render source descriptions', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByText('Remote job listings')).toBeInTheDocument()
    expect(screen.getByText('Remote jobs worldwide')).toBeInTheDocument()
    expect(screen.getByText('Jobs in Europe and remote')).toBeInTheDocument()
    expect(screen.getByText('Google Jobs via search API')).toBeInTheDocument()
  })

  it('[P1] should render Ready badge for open sources', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const readyBadges = screen.getAllByText('Ready')
    expect(readyBadges).toHaveLength(3)
  })

  it('[P2] should render API key input for key-required sources', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key (optional)')
    expect(apiKeyInput).toBeInTheDocument()
  })

  it('[P2] should accept text input in API key field', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText('Enter API key (optional)')
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test-12345' } })
    expect(apiKeyInput).toHaveValue('sk-test-12345')
  })

  it('[P2] should render instructional text about starting discovery', () => {
    render(<SourcesStep onValidChange={vi.fn()} />)
    expect(screen.getByText(/Click.*Start Discovery.*to begin finding jobs/)).toBeInTheDocument()
  })
})
