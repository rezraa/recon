// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: vi.fn(),
}))

import { usePreferences } from '@/hooks/usePreferences'

import { PreferencesStep } from './PreferencesStep'

const mockUsePreferences = vi.mocked(usePreferences)
const mockFetch = vi.fn()

function renderWithSWR(ui: ReactNode) {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      {ui}
    </SWRConfig>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockUsePreferences.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  })
})

describe('PreferencesStep', () => {
  it('[P1] should render all form fields', () => {
    const onValidChange = vi.fn()
    renderWithSWR(<PreferencesStep onValidChange={onValidChange} />)

    expect(screen.getByText('Set your job search preferences')).toBeInTheDocument()
    expect(screen.getByLabelText(/Target Job Titles/)).toBeInTheDocument()
    expect(screen.getByLabelText('Minimum Salary')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum Salary')).toBeInTheDocument()
    expect(screen.getByLabelText(/Preferred Locations/)).toBeInTheDocument()
    expect(screen.getByText('Remote Preference')).toBeInTheDocument()
  })

  it('[P1] should call onValidChange(false) on mount', () => {
    const onValidChange = vi.fn()
    renderWithSWR(<PreferencesStep onValidChange={onValidChange} />)
    expect(onValidChange).toHaveBeenCalledWith(false)
  })

  it('[P1] should add title chip on Enter key', () => {
    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)
    const input = screen.getByLabelText(/Target Job Titles/)

    fireEvent.change(input, { target: { value: 'Frontend Engineer' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('[P1] should add title chip on comma key', () => {
    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)
    const input = screen.getByLabelText(/Target Job Titles/)

    fireEvent.change(input, { target: { value: 'Backend Dev' } })
    fireEvent.keyDown(input, { key: ',' })

    expect(screen.getByText('Backend Dev')).toBeInTheDocument()
  })

  it('[P1] should remove title chip on X click', () => {
    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)
    const input = screen.getByLabelText(/Target Job Titles/)

    fireEvent.change(input, { target: { value: 'Engineer' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('Engineer')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Remove Engineer'))

    expect(screen.queryByText('Engineer')).not.toBeInTheDocument()
  })

  it('[P1] should prevent duplicate titles (case-insensitive)', () => {
    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)
    const input = screen.getByLabelText(/Target Job Titles/)

    fireEvent.change(input, { target: { value: 'Engineer' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'engineer' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const chips = screen.getByTestId('title-chips')
    expect(chips.children).toHaveLength(1)
  })

  it('[P0] should show error when no titles and tries to submit', async () => {
    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)

    fireEvent.click(screen.getByText('Save & Continue'))

    await waitFor(() => {
      expect(screen.getByText('At least one target job title is required')).toBeInTheDocument()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('[P0] should show error when salary min > max', async () => {
    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)

    // Add a title first to pass that validation
    const titleInput = screen.getByLabelText(/Target Job Titles/)
    fireEvent.change(titleInput, { target: { value: 'Engineer' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    fireEvent.change(screen.getByLabelText('Minimum Salary'), { target: { value: '200000' } })
    fireEvent.change(screen.getByLabelText('Maximum Salary'), { target: { value: '100000' } })

    fireEvent.click(screen.getByText('Save & Continue'))

    await waitFor(() => {
      expect(screen.getByText('Minimum salary must be less than maximum')).toBeInTheDocument()
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('[P0] should call onValidChange(true) after successful save', async () => {
    const onValidChange = vi.fn()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'pref-1' } }),
    })

    renderWithSWR(<PreferencesStep onValidChange={onValidChange} />)

    const titleInput = screen.getByLabelText(/Target Job Titles/)
    fireEvent.change(titleInput, { target: { value: 'Engineer' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    fireEvent.click(screen.getByText('Save & Continue'))

    await waitFor(() => {
      expect(onValidChange).toHaveBeenCalledWith(true)
    })
  })

  it('[P1] should submit with only titles (optional fields empty)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'pref-1' } }),
    })

    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)

    const titleInput = screen.getByLabelText(/Target Job Titles/)
    fireEvent.change(titleInput, { target: { value: 'Developer' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    fireEvent.click(screen.getByText('Save & Continue'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/preferences', expect.objectContaining({
        method: 'PUT',
      }))
    })

    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(callBody.target_titles).toEqual(['Developer'])
    expect(callBody.remote_preference).toBe('no_preference')
  })

  it('[P1] should pre-populate from existing preferences data', () => {
    mockUsePreferences.mockReturnValue({
      data: {
        id: 'pref-existing',
        targetTitles: ['Existing Title'],
        salaryMin: 90000,
        salaryMax: 160000,
        locations: ['NYC'],
        remotePreference: 'hybrid_ok',
        createdAt: '2026-03-06T00:00:00Z',
        updatedAt: '2026-03-06T00:00:00Z',
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })

    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)

    expect(screen.getByText('Existing Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Minimum Salary')).toHaveValue(90000)
    expect(screen.getByLabelText('Maximum Salary')).toHaveValue(160000)
    expect(screen.getByText('NYC')).toBeInTheDocument()
  })

  it('[P1] should show API error feedback on server failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 500, message: 'Server error' } }),
    })

    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)

    const titleInput = screen.getByLabelText(/Target Job Titles/)
    fireEvent.change(titleInput, { target: { value: 'Engineer' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    fireEvent.click(screen.getByText('Save & Continue'))

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('[P1] should show network error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)

    const titleInput = screen.getByLabelText(/Target Job Titles/)
    fireEvent.change(titleInput, { target: { value: 'Engineer' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    fireEvent.click(screen.getByText('Save & Continue'))

    await waitFor(() => {
      expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument()
    })
  })

  it('[P1] should render retry button on API error and retry on click', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 500, message: 'Server error' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'pref-1' } }),
      })

    const onValidChange = vi.fn()
    renderWithSWR(<PreferencesStep onValidChange={onValidChange} />)

    const titleInput = screen.getByLabelText(/Target Job Titles/)
    fireEvent.change(titleInput, { target: { value: 'Engineer' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    fireEvent.click(screen.getByText('Save & Continue'))

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    expect(screen.getByText('Retry')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(onValidChange).toHaveBeenCalledWith(true)
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('[P2] should show loading state while preferences load', () => {
    mockUsePreferences.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    })

    renderWithSWR(<PreferencesStep onValidChange={vi.fn()} />)
    expect(screen.getByText('Loading preferences...')).toBeInTheDocument()
  })
})
