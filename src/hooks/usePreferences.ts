import useSWR from 'swr'

interface PreferencesResponse {
  id: string
  targetTitles: string[]
  salaryMin: number | null
  salaryMax: number | null
  locations: string[]
  remotePreference: string
  createdAt: string
  updatedAt: string
}

const preferencesFetcher = async (url: string): Promise<PreferencesResponse | null> => {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Preferences API error: ${res.status}`)
  const json = await res.json()
  return json.data
}

export function usePreferences() {
  const { data, error, isLoading, mutate } = useSWR<PreferencesResponse | null>('/api/preferences', preferencesFetcher)
  return { data, error, isLoading, mutate }
}
