import useSWR from 'swr'

export interface JobItem {
  id: string
  title: string | null
  company: string | null
  salaryMin: number | null
  salaryMax: number | null
  location: string | null
  isRemote: boolean
  sourceUrl: string | null
  sourceName: string
  sources: Array<{ name: string; external_id: string; fetched_at: string }>
  dedupConfidence: number | null
  matchScore: number | null
  matchBreakdown: Record<string, unknown> | null
  pipelineStage: string
  discoveredAt: string | null
  isDismissed: boolean
}

interface JobsResponse {
  data: {
    jobs: JobItem[]
    total: number
    threshold: number | null
  }
}

export function useJobs(params?: { limit?: number; offset?: number; showAll?: boolean }) {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))
  if (params?.showAll) searchParams.set('showAll', 'true')
  const query = searchParams.toString()

  const { data, error, isLoading, mutate } = useSWR<JobsResponse>(
    `/api/jobs${query ? `?${query}` : ''}`,
  )

  return {
    jobs: data?.data?.jobs ?? [],
    total: data?.data?.total ?? 0,
    threshold: data?.data?.threshold ?? null,
    error,
    isLoading,
    mutate,
  }
}
