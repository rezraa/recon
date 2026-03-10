'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'

import { PreferencesStep } from '@/components/onboarding/PreferencesStep'
import { ResumeStep } from '@/components/onboarding/ResumeStep'
import { SourcesStep } from '@/components/onboarding/SourcesStep'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [rescoreStatus, setRescoreStatus] = useState<'idle' | 'rescoring' | 'done' | 'error'>('idle')
  // Track whether the user has actively re-uploaded (not just initial page load)
  const hasReUploaded = useRef(false)
  const initialLoadDone = useRef(false)

  const handlePrefsValid = useCallback((isValid: boolean) => {
    if (isValid) {
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 3000)
    }
  }, [])

  const handleResumeValid = useCallback(async (isValid: boolean) => {
    if (!isValid) return

    // Skip the initial onValidChange(true) from ResumeStep mounting with existing data
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      return
    }

    // Only rescore when user actively re-uploaded
    hasReUploaded.current = true

    if (rescoreStatus !== 'idle' && rescoreStatus !== 'done') return
    setRescoreStatus('rescoring')
    try {
      const res = await fetch('/api/rescore', { method: 'POST' })
      if (res.ok) {
        setRescoreStatus('done')
        setTimeout(() => setRescoreStatus('idle'), 5000)
      } else {
        setRescoreStatus('error')
      }
    } catch {
      setRescoreStatus('error')
    }
  }, [rescoreStatus])

  const handleSourcesValid = useCallback(() => {
    // Sources step is always valid — no action needed
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to Feed
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      {/* Preferences Section */}
      <section className="mb-8">
        {prefsSaved && (
          <div className="mb-3 rounded border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-700 dark:text-green-400">
            Preferences updated
          </div>
        )}
        <PreferencesStep onValidChange={handlePrefsValid} />
      </section>

      {/* Resume Section */}
      <section className="mb-8">
        {rescoreStatus === 'rescoring' && (
          <div className="mb-3 rounded border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-700 dark:text-blue-400">
            Resume updated — rescoring jobs...
          </div>
        )}
        {rescoreStatus === 'done' && (
          <div className="mb-3 rounded border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-700 dark:text-green-400">
            Rescoring complete
          </div>
        )}
        {rescoreStatus === 'error' && (
          <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-400">
            Failed to start rescoring. Please try again.
          </div>
        )}
        <ResumeStep onValidChange={handleResumeValid} />
      </section>

      {/* Sources Section */}
      <section className="mb-8">
        <SourcesStep onValidChange={handleSourcesValid} />
      </section>
    </div>
  )
}
