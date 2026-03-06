'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import useSWR from 'swr'

const resumeFetcher = async (url: string) => {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Resume API error: ${res.status}`)
  const json = await res.json()
  return json.data
}

export function useResume() {
  const { data, error, isLoading } = useSWR('/api/resume', resumeFetcher)
  return { data, error, isLoading }
}

export function useResumeRedirect(options: { redirectTo: string; when: 'exists' | 'missing' }) {
  const { data, isLoading } = useResume()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (options.when === 'exists' && data !== null && data !== undefined) {
      router.replace(options.redirectTo)
    }
    if (options.when === 'missing' && data === null) {
      router.replace(options.redirectTo)
    }
  }, [data, isLoading, options.redirectTo, options.when, router])

  return { data, isLoading }
}
