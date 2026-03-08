'use client'

import useSWR from 'swr'

const sourcesFetcher = async (url: string) => {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Sources API error: ${res.status}`)
  const json = await res.json()
  return json.data
}

export function useSources() {
  const { data, error, isLoading, mutate } = useSWR('/api/sources', sourcesFetcher)
  return { data, error, isLoading, mutate }
}
