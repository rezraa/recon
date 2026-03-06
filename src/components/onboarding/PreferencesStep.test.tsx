// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PreferencesStep } from './PreferencesStep'

describe('PreferencesStep', () => {
  it('should render instructional text', () => {
    const onValidChange = vi.fn()
    render(<PreferencesStep onValidChange={onValidChange} />)
    expect(screen.getByText('Set your job search preferences')).toBeDefined()
  })

  it('should render preference form fields', () => {
    const onValidChange = vi.fn()
    render(<PreferencesStep onValidChange={onValidChange} />)
    expect(screen.getByLabelText('Target Job Titles')).toBeDefined()
    expect(screen.getByLabelText('Minimum Salary')).toBeDefined()
    expect(screen.getByLabelText('Maximum Salary')).toBeDefined()
    expect(screen.getByLabelText('Preferred Locations')).toBeDefined()
    expect(screen.getByText('Remote Preference')).toBeDefined()
  })

  it('should call onValidChange with true on mount', () => {
    const onValidChange = vi.fn()
    render(<PreferencesStep onValidChange={onValidChange} />)
    expect(onValidChange).toHaveBeenCalledWith(true)
  })
})
