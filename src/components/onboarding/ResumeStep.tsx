'use client'

import { useEffect } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StepProps {
  onValidChange: (isValid: boolean) => void
}

export function ResumeStep({ onValidChange }: StepProps) {
  useEffect(() => {
    // For this story: always report valid=true (actual upload logic in Story 2.2)
    onValidChange(true)
  }, [onValidChange])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload your resume PDF to get started</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25">
          <p className="text-sm text-muted-foreground">
            Drop your resume here or click to browse
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
