'use client'

import { SWRConfig } from 'swr'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher: (url: string) => fetch(url).then(r => r.json()),
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      errorRetryCount: 3,
    }}>
      {children}
    </SWRConfig>
  )
}
