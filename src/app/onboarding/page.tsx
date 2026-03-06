'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { Skeleton } from '@/components/ui/skeleton'
import { useResumeRedirect } from '@/hooks/useResume'

export default function OnboardingPage() {
  const router = useRouter()
  const { isLoading } = useResumeRedirect({
    redirectTo: '/',
    when: 'exists',
  })

  const handleComplete = useCallback(() => {
    router.replace('/')
  }, [router])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  return <OnboardingWizard onComplete={handleComplete} />
}
