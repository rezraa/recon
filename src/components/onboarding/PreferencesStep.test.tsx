// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PreferencesStep } from './PreferencesStep'

describe('PreferencesStep', () => {
  it('[P1] should render instructional text', () => {
    const onValidChange = vi.fn()
    render(<PreferencesStep onValidChange={onValidChange} />)
    expect(screen.getByText('Set your job search preferences')).toBeInTheDocument()
  })

  it('[P1] should render all preference form fields', () => {
    const onValidChange = vi.fn()
    render(<PreferencesStep onValidChange={onValidChange} />)
    expect(screen.getByLabelText('Target Job Titles')).toBeInTheDocument()
    expect(screen.getByLabelText('Minimum Salary')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum Salary')).toBeInTheDocument()
    expect(screen.getByLabelText('Preferred Locations')).toBeInTheDocument()
    expect(screen.getByText('Remote Preference')).toBeInTheDocument()
  })

  it('[P1] should call onValidChange with true on mount', () => {
    const onValidChange = vi.fn()
    render(<PreferencesStep onValidChange={onValidChange} />)
    expect(onValidChange).toHaveBeenCalledWith(true)
  })

  it('[P1] should accept text input in Target Job Titles field', () => {
    render(<PreferencesStep onValidChange={vi.fn()} />)
    const input = screen.getByLabelText('Target Job Titles')
    fireEvent.change(input, { target: { value: 'Frontend Engineer' } })
    expect(input).toHaveValue('Frontend Engineer')
  })

  it('[P1] should accept numeric input in salary fields', () => {
    render(<PreferencesStep onValidChange={vi.fn()} />)
    const minSalary = screen.getByLabelText('Minimum Salary')
    const maxSalary = screen.getByLabelText('Maximum Salary')
    fireEvent.change(minSalary, { target: { value: '80000' } })
    fireEvent.change(maxSalary, { target: { value: '150000' } })
    expect(minSalary).toHaveValue(80000)
    expect(maxSalary).toHaveValue(150000)
  })

  it('[P1] should accept text input in Preferred Locations field', () => {
    render(<PreferencesStep onValidChange={vi.fn()} />)
    const input = screen.getByLabelText('Preferred Locations')
    fireEvent.change(input, { target: { value: 'San Francisco, Remote' } })
    expect(input).toHaveValue('San Francisco, Remote')
  })

  it('[P2] should render placeholder text for all input fields', () => {
    render(<PreferencesStep onValidChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. Frontend Engineer, Full Stack Developer')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 80000')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 150000')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. San Francisco, New York, Remote')).toBeInTheDocument()
  })

  it('[P2] should render salary fields as number type', () => {
    render(<PreferencesStep onValidChange={vi.fn()} />)
    expect(screen.getByLabelText('Minimum Salary')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Maximum Salary')).toHaveAttribute('type', 'number')
  })
})
