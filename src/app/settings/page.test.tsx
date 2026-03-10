// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock onboarding components
vi.mock('@/components/onboarding/PreferencesStep', () => ({
  PreferencesStep: ({ onValidChange }: { onValidChange: (v: boolean) => void }) => (
    <div data-testid="preferences-step">
      <button onClick={() => onValidChange(true)} data-testid="save-prefs">Save Prefs</button>
    </div>
  ),
}))

vi.mock('@/components/onboarding/ResumeStep', () => ({
  ResumeStep: ({ onValidChange }: { onValidChange: (v: boolean) => void }) => (
    <div data-testid="resume-step">
      <button onClick={() => onValidChange(true)} data-testid="upload-resume">Upload Resume</button>
    </div>
  ),
}))

vi.mock('@/components/onboarding/SourcesStep', () => ({
  SourcesStep: ({ onValidChange }: { onValidChange: (v: boolean) => void }) => (
    <div data-testid="sources-step">
      <button onClick={() => onValidChange(true)} data-testid="save-sources">Save Sources</button>
    </div>
  ),
}))

import SettingsPage from './page'

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('[P1] should render all three sections: preferences, resume, sources', () => {
    render(<SettingsPage />)

    expect(screen.getByTestId('preferences-step')).toBeInTheDocument()
    expect(screen.getByTestId('resume-step')).toBeInTheDocument()
    expect(screen.getByTestId('sources-step')).toBeInTheDocument()
  })

  it('[P1] should render Settings heading', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('[P1] should render back-to-feed link', () => {
    render(<SettingsPage />)
    const link = screen.getByText('Back to Feed')
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })

  it('[P1] should show success toast when preferences are saved', async () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByTestId('save-prefs'))

    await waitFor(() => {
      expect(screen.getByText('Preferences updated')).toBeInTheDocument()
    })
  })

  it('[P1] should trigger rescore when resume is re-uploaded', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch

    render(<SettingsPage />)

    // First call sets initialLoadDone, second triggers rescore
    fireEvent.click(screen.getByTestId('upload-resume'))
    fireEvent.click(screen.getByTestId('upload-resume'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/rescore', { method: 'POST' })
    })
  })

  it('[P1] should show rescoring status banner during rescore', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch

    render(<SettingsPage />)

    // Trigger rescore (skip initial load)
    fireEvent.click(screen.getByTestId('upload-resume'))
    fireEvent.click(screen.getByTestId('upload-resume'))

    await waitFor(() => {
      expect(screen.getByText('Resume updated — rescoring jobs...')).toBeInTheDocument()
    })
  })

  it('[P1] should show error banner when rescore fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false })
    global.fetch = mockFetch

    render(<SettingsPage />)

    // Trigger rescore (skip initial load)
    fireEvent.click(screen.getByTestId('upload-resume'))
    fireEvent.click(screen.getByTestId('upload-resume'))

    await waitFor(() => {
      expect(screen.getByText('Failed to start rescoring. Please try again.')).toBeInTheDocument()
    })
  })

  it('[P1] should show error when fetch throws network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<SettingsPage />)

    fireEvent.click(screen.getByTestId('upload-resume'))
    fireEvent.click(screen.getByTestId('upload-resume'))

    await waitFor(() => {
      expect(screen.getByText('Failed to start rescoring. Please try again.')).toBeInTheDocument()
    })
  })
})
