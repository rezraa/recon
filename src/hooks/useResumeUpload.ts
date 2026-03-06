'use client'

import { useCallback, useState } from 'react'
import { useSWRConfig } from 'swr'

import type { ParsedResume } from '@/lib/pipeline/resumeTypes'

interface UploadResult {
  id: string
  fileName: string
  parsedData: ParsedResume
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export function useResumeUpload() {
  const [state, setState] = useState<UploadState>('idle')
  const [parsedData, setParsedData] = useState<ParsedResume | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const { mutate } = useSWRConfig()

  const upload = useCallback(async (file: File) => {
    setState('uploading')
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      if (!res.ok) {
        setState('error')
        setError(json.error?.message || 'Upload failed')
        return
      }

      const result = json.data as UploadResult
      setParsedData(result.parsedData)
      setResumeId(result.id)
      setState('success')
      await mutate('/api/resume')
    } catch {
      setState('error')
      setError('Network error. Please try again.')
    }
  }, [mutate])

  const reset = useCallback(() => {
    setState('idle')
    setParsedData(null)
    setError(null)
    setResumeId(null)
  }, [])

  return {
    upload,
    isUploading: state === 'uploading',
    parsedData,
    error,
    resumeId,
    state,
    reset,
  }
}
