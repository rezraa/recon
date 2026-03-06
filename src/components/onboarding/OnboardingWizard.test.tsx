// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', () => {
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: {
      div: React.forwardRef(function MotionDiv(props: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) {
        const { children, variants: _v, initial: _i, animate: _a, exit: _e, transition: _t, custom: _c, ...rest } = props
        return React.createElement('div', { ...rest, ref }, children as React.ReactNode)
      }),
    },
  }
})

// Mock ResumeStep to avoid loading heavy deps (pdf-parse, lucide-react)
// and to report valid=true so wizard navigation works
vi.mock('./ResumeStep', () => ({
  ResumeStep: ({ onValidChange }: { onValidChange: (v: boolean) => void }) => {
    React.useEffect(() => { onValidChange(true) }, [onValidChange])
    return React.createElement('div', null, 'Upload your resume PDF to get started')
  },
}))

import { OnboardingWizard } from './OnboardingWizard'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OnboardingWizard', () => {
  it('[P1] should render step 1 (Resume) by default', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    expect(screen.getByText('Upload your resume PDF to get started')).toBeInTheDocument()
  })

  it('[P1] should show step indicator with 3 steps', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(screen.getByText('Sources')).toBeInTheDocument()
  })

  it('[P1] should have Back button disabled on first step', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    const backButton = screen.getByText('Back')
    expect((backButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('[P0] should navigate to step 2 when Next is clicked', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set your job search preferences')).toBeInTheDocument()
  })

  it('[P0] should navigate back to step 1 from step 2', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Upload your resume PDF to get started')).toBeInTheDocument()
  })

  it('[P0] should show Start Discovery button on step 3', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Start Discovery')).toBeInTheDocument()
  })

  it('[P1] should enable Back button on step 2', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Next'))
    const backButton = screen.getByText('Back')
    expect((backButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('[P0] should complete full forward navigation through all 3 steps', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    // Step 1
    expect(screen.getByText('Upload your resume PDF to get started')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    // Step 2
    expect(screen.getByText('Set your job search preferences')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    // Step 3
    expect(screen.getByText('Configure job sources')).toBeInTheDocument()
    expect(screen.getByText('Start Discovery')).toBeInTheDocument()
  })

  it('[P2] should preserve step content when navigating back and forward', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    // Go to step 2
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set your job search preferences')).toBeInTheDocument()
    // Back to step 1
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Upload your resume PDF to get started')).toBeInTheDocument()
    // Forward to step 2 again
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Set your job search preferences')).toBeInTheDocument()
  })

  it('[P2] should not navigate past step 3', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    // On step 3, no Next button — only Start Discovery
    expect(screen.queryByText('Next')).toBeNull()
    expect(screen.getByText('Start Discovery')).toBeInTheDocument()
  })

  it('[P2] should not navigate before step 1', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)
    const backButton = screen.getByText('Back')
    // Click back on step 1 - should stay on step 1
    fireEvent.click(backButton)
    expect(screen.getByText('Upload your resume PDF to get started')).toBeInTheDocument()
  })

  it('[P0] should call fetch and onComplete when Start Discovery is clicked', async () => {
    const onComplete = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { runId: 'stub', status: 'pending' } }), { status: 202 }),
    )

    render(<OnboardingWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Start Discovery'))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/discovery/run', { method: 'POST' })
    })
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })
  })

  it('[P1] should show error message when discovery API returns non-ok response', async () => {
    const onComplete = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    )

    render(<OnboardingWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Start Discovery'))

    await waitFor(() => {
      expect(screen.getByText('Failed to start discovery. Please try again.')).toBeInTheDocument()
    })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('[P1] should show error message on network failure', async () => {
    const onComplete = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    render(<OnboardingWizard onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Start Discovery'))

    await waitFor(() => {
      expect(screen.getByText('Network error. Please check your connection and try again.')).toBeInTheDocument()
    })
    expect(onComplete).not.toHaveBeenCalled()
  })
})
