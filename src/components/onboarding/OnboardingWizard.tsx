'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { PreferencesStep } from './PreferencesStep'
import { ResumeStep } from './ResumeStep'
import { SourcesStep } from './SourcesStep'

const STEP_LABELS = ['Resume', 'Preferences', 'Sources'] as const

interface OnboardingWizardProps {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [stepValidity, setStepValidity] = useState<Record<number, boolean>>({})
  const [direction, setDirection] = useState(1)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleValidChange0 = useCallback(
    (isValid: boolean) => setStepValidity((prev) => ({ ...prev, 0: isValid })),
    [],
  )
  const handleValidChange1 = useCallback(
    (isValid: boolean) => setStepValidity((prev) => ({ ...prev, 1: isValid })),
    [],
  )
  const handleValidChange2 = useCallback(
    (isValid: boolean) => setStepValidity((prev) => ({ ...prev, 2: isValid })),
    [],
  )
  const validChangeHandlers = useMemo(
    () => [handleValidChange0, handleValidChange1, handleValidChange2],
    [handleValidChange0, handleValidChange1, handleValidChange2],
  )

  const handleNext = useCallback(() => {
    if (currentStep < STEP_LABELS.length - 1) {
      setDirection(1)
      setCurrentStep((prev) => prev + 1)
    }
  }, [currentStep])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1)
      setCurrentStep((prev) => prev - 1)
    }
  }, [currentStep])

  const handleStartDiscovery = useCallback(async () => {
    setIsSubmitting(true)
    setDiscoveryError(null)
    try {
      const res = await fetch('/api/discovery/run', { method: 'POST' })
      if (!res.ok) {
        setDiscoveryError('Failed to start discovery. Please try again.')
        return
      }
      onComplete()
    } catch {
      setDiscoveryError('Network error. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [onComplete])

  const isCurrentStepValid = stepValidity[currentStep] ?? false
  const isLastStep = currentStep === STEP_LABELS.length - 1

  return (
    <div className="mx-auto max-w-2xl py-12">
      {/* Step Indicator */}
      <div className="mb-8 flex items-center justify-center">
        {STEP_LABELS.map((label, index) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium',
                  index < currentStep && 'bg-primary text-primary-foreground',
                  index === currentStep &&
                    'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background',
                  index > currentStep && 'bg-muted text-muted-foreground',
                )}
              >
                {index < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span className="mt-2 text-sm text-muted-foreground">{label}</span>
            </div>
            {index < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  'mx-4 mb-6 h-0.5 w-16',
                  index < currentStep ? 'bg-primary' : 'bg-muted',
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, y: d > 0 ? 10 : -10 }),
            center: { opacity: 1, y: 0 },
            exit: (d: number) => ({ opacity: 0, y: d > 0 ? -10 : 10 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.15 }}
        >
          {currentStep === 0 && (
            <ResumeStep onValidChange={validChangeHandlers[0]} />
          )}
          {currentStep === 1 && (
            <PreferencesStep onValidChange={validChangeHandlers[1]} />
          )}
          {currentStep === 2 && (
            <SourcesStep onValidChange={validChangeHandlers[2]} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Error Message */}
      {discoveryError && (
        <p className="mt-4 text-sm text-destructive">{discoveryError}</p>
      )}

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          Back
        </Button>
        {isLastStep ? (
          <Button onClick={handleStartDiscovery} disabled={!isCurrentStepValid || isSubmitting}>
            {isSubmitting ? 'Starting...' : 'Start Discovery'}
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={!isCurrentStepValid}>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
