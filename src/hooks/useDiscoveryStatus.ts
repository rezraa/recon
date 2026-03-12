import useSWR from 'swr'

interface DiscoveryStatusResponse {
  data: {
    status: 'fetching' | 'scoring' | 'completed' | 'failed'
    sources_completed: number
    sources_total: number
    listings_fetched: number
    listings_new: number
    listings_scored: number
    started_at: string
  }
}

export function useDiscoveryStatus(runId: string | null) {
  const { data, error, isLoading } = useSWR<DiscoveryStatusResponse>(
    runId ? `/api/discovery/status?runId=${runId}` : null,
    {
      refreshInterval: (latestData) => {
        const s = latestData?.data?.status
        if (s === 'completed' || s === 'failed') return 0
        return runId ? 3000 : 0
      },
      revalidateOnFocus: false,
    },
  )

  const status = data?.data?.status ?? null
  const isComplete = status === 'completed' || status === 'failed'

  return {
    status,
    sourcesCompleted: data?.data?.sources_completed ?? 0,
    sourcesTotal: data?.data?.sources_total ?? 0,
    listingsFetched: data?.data?.listings_fetched ?? 0,
    listingsNew: data?.data?.listings_new ?? 0,
    listingsScored: data?.data?.listings_scored ?? 0,
    isComplete,
    error,
    isLoading,
  }
}
