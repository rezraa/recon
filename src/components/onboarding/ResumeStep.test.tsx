// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ResumeStep } from './ResumeStep'

describe('ResumeStep', () => {
  it('should render instructional text', () => {
    const onValidChange = vi.fn()
    render(<ResumeStep onValidChange={onValidChange} />)
    expect(screen.getByText('Upload your resume PDF to get started')).toBeDefined()
  })

  it('should render file upload drop zone', () => {
    const onValidChange = vi.fn()
    render(<ResumeStep onValidChange={onValidChange} />)
    expect(screen.getByText('Drop your resume here or click to browse')).toBeDefined()
  })

  it('should call onValidChange with true on mount', () => {
    const onValidChange = vi.fn()
    render(<ResumeStep onValidChange={onValidChange} />)
    expect(onValidChange).toHaveBeenCalledWith(true)
  })
})
