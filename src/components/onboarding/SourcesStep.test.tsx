// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SourcesStep } from './SourcesStep'

describe('SourcesStep', () => {
  it('should render all 4 sources', () => {
    const onValidChange = vi.fn()
    render(<SourcesStep onValidChange={onValidChange} />)
    expect(screen.getByText('RemoteOK')).toBeDefined()
    expect(screen.getByText('Jobicy')).toBeDefined()
    expect(screen.getByText('Arbeitnow')).toBeDefined()
    expect(screen.getByText('Serply')).toBeDefined()
  })

  it('should render source type headings', () => {
    const onValidChange = vi.fn()
    render(<SourcesStep onValidChange={onValidChange} />)
    expect(screen.getByText('Open Sources (no API key needed)')).toBeDefined()
    expect(screen.getByText('API Key Required')).toBeDefined()
  })

  it('should call onValidChange with true on mount', () => {
    const onValidChange = vi.fn()
    render(<SourcesStep onValidChange={onValidChange} />)
    expect(onValidChange).toHaveBeenCalledWith(true)
  })
})
