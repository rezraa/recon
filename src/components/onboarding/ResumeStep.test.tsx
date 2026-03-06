// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpload = vi.fn()
const mockReset = vi.fn()

vi.mock('@/hooks/useResumeUpload', () => ({
  useResumeUpload: vi.fn(() => ({
    upload: mockUpload,
    isUploading: false,
    parsedData: null,
    error: null,
    resumeId: null,
    state: 'idle',
    reset: mockReset,
  })),
}))

import { useResumeUpload } from '@/hooks/useResumeUpload'

import { ResumeStep } from './ResumeStep'

const mockUseResumeUpload = vi.mocked(useResumeUpload)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseResumeUpload.mockReturnValue({
    upload: mockUpload,
    isUploading: false,
    parsedData: null,
    error: null,
    resumeId: null,
    state: 'idle',
    reset: mockReset,
  })
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('ResumeStep', () => {
  describe('initial state', () => {
    it('[P1] should render upload zone with instructions', () => {
      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)
      expect(screen.getByText('Upload your resume PDF to get started')).toBeDefined()
      expect(screen.getByText('Drop your resume here or click to browse')).toBeDefined()
    })

    it('[P1] should call onValidChange with false when no resume uploaded', () => {
      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)
      expect(onValidChange).toHaveBeenCalledWith(false)
    })
  })

  describe('file validation', () => {
    it('[P0] should show error for non-PDF files', async () => {
      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      const input = screen.getByTestId('file-input')
      const file = new File(['not-pdf'], 'doc.txt', { type: 'text/plain' })
      fireEvent.change(input, { target: { files: [file] } })

      expect(screen.getByText('Please upload a PDF file')).toBeDefined()
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('[P0] should show error for files over 5MB', async () => {
      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      const input = screen.getByTestId('file-input')
      const largeContent = new Uint8Array(5 * 1024 * 1024 + 1)
      const file = new File([largeContent], 'big.pdf', { type: 'application/pdf' })
      Object.defineProperty(file, 'name', { value: 'big.pdf' })
      fireEvent.change(input, { target: { files: [file] } })

      expect(screen.getByText('File size exceeds 5MB limit')).toBeDefined()
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('[P0] should call upload for valid PDF files', async () => {
      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      const input = screen.getByTestId('file-input')
      const file = new File(['pdf-content'], 'resume.pdf', { type: 'application/pdf' })
      fireEvent.change(input, { target: { files: [file] } })

      expect(mockUpload).toHaveBeenCalledWith(file)
    })
  })

  describe('loading state', () => {
    it('[P1] should show skeleton while uploading', () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: true,
        parsedData: null,
        error: null,
        resumeId: null,
        state: 'uploading',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)
      expect(screen.getByTestId('upload-skeleton')).toBeDefined()
    })
  })

  describe('error display', () => {
    it('[P1] should display upload error from hook', () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        parsedData: null,
        error: 'Server error occurred',
        resumeId: null,
        state: 'error',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)
      expect(screen.getByTestId('upload-error').textContent).toBe('Server error occurred')
    })
  })

  describe('parsed data display', () => {
    const mockParsedData = {
      skills: ['TypeScript', 'React', 'Node.js'],
      experience: [
        { title: 'Senior Engineer', company: 'Acme Corp', years: 3 },
      ],
      jobTitles: ['Senior Engineer'],
    }

    it('[P1] should display skills as badges when parsed data is available', () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        parsedData: mockParsedData,
        error: null,
        resumeId: 'r-1',
        state: 'success',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      expect(screen.getByText('TypeScript')).toBeDefined()
      expect(screen.getByText('React')).toBeDefined()
      expect(screen.getByText('Node.js')).toBeDefined()
    })

    it('[P1] should call onValidChange with true when parsed data exists', () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        parsedData: mockParsedData,
        error: null,
        resumeId: 'r-1',
        state: 'success',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)
      expect(onValidChange).toHaveBeenCalledWith(true)
    })

    it('[P1] should display experience entries', () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        parsedData: mockParsedData,
        error: null,
        resumeId: 'r-1',
        state: 'success',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      expect(screen.getByDisplayValue('Senior Engineer')).toBeDefined()
      expect(screen.getByDisplayValue('Acme Corp')).toBeDefined()
      expect(screen.getByDisplayValue('3')).toBeDefined()
    })

    it('[P1] should display job titles as badges', () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        parsedData: mockParsedData,
        error: null,
        resumeId: 'r-1',
        state: 'success',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)
      expect(screen.getByText('Senior Engineer')).toBeDefined()
    })

    it('[P1] should remove skill when x button is clicked', async () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        parsedData: mockParsedData,
        error: null,
        resumeId: 'r-1',
        state: 'success',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      const removeButton = screen.getByLabelText('Remove TypeScript')
      fireEvent.click(removeButton)

      await waitFor(() => {
        expect(screen.queryByText('TypeScript')).toBeNull()
      })
    })

    it('[P1] should add skill when typing and pressing Enter', async () => {
      mockUseResumeUpload.mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        parsedData: mockParsedData,
        error: null,
        resumeId: 'r-1',
        state: 'success',
        reset: mockReset,
      })

      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      const input = screen.getByTestId('add-skill-input')
      fireEvent.change(input, { target: { value: 'GraphQL' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(screen.getByText('GraphQL')).toBeDefined()
      })
    })
  })

  describe('drag and drop', () => {
    it('[P2] should show visual feedback on drag enter', () => {
      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      const dropZone = screen.getByRole('button')
      fireEvent.dragEnter(dropZone, { dataTransfer: { files: [] } })

      expect(dropZone.className).toContain('border-primary')
    })

    it('[P2] should remove visual feedback on drag leave', () => {
      const onValidChange = vi.fn()
      render(<ResumeStep onValidChange={onValidChange} />)

      const dropZone = screen.getByRole('button')
      fireEvent.dragEnter(dropZone, { dataTransfer: { files: [] } })
      fireEvent.dragLeave(dropZone, { dataTransfer: { files: [] } })

      expect(dropZone.className).not.toContain('border-primary')
    })
  })
})
