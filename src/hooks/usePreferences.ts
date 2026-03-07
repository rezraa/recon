import useSWR from 'swr'

const preferencesFetcher = async (url: string) => {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Preferences API error: ${res.status}`)
  const json = await res.json()
  return json.data
}

export function usePreferences() {
  const { data, error, isLoading, mutate } = useSWR('/api/preferences', preferencesFetcher)
  return { data, error, isLoading, mutate }
}
