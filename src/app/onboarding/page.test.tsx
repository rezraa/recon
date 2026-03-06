// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

const mockUseResumeRedirect = vi.fn()

vi.mock('@/hooks/useResume', () => ({
  useResumeRedirect: (...args: unknown[]) => mockUseResumeRedirect(...args),
}))

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

import OnboardingPage from './page'

beforeEach(() => {
  mockReplace.mockClear()
  mockUseResumeRedirect.mockReset()
})

describe('OnboardingPage', () => {
  it('[P1] should render wizard when no resume exists', () => {
    mockUseResumeRedirect.mockReturnValue({ data: null, isLoading: false })
    render(<OnboardingPage />)
    expect(screen.getByText('Upload your resume PDF to get started')).toBeInTheDocument()
  })

  it('[P1] should show loading skeleton while checking resume', () => {
    mockUseResumeRedirect.mockReturnValue({ data: null, isLoading: true })
    render(<OnboardingPage />)
    expect(screen.queryByText('Upload your resume PDF to get started')).toBeNull()
  })

  it('[P1] should call useResumeRedirect with redirect to / when resume exists', () => {
    mockUseResumeRedirect.mockReturnValue({ data: null, isLoading: false })
    render(<OnboardingPage />)
    expect(mockUseResumeRedirect).toHaveBeenCalledWith({
      redirectTo: '/',
      when: 'exists',
    })
  })
})
