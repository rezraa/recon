'use client'

import { Check } from 'lucide-react'
import { useEffect } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface StepProps {
  onValidChange: (isValid: boolean) => void
}

const openSources = [
  { name: 'RemoteOK', description: 'Remote job listings' },
  { name: 'Jobicy', description: 'Remote jobs worldwide' },
  { name: 'Arbeitnow', description: 'Jobs in Europe and remote' },
]

const keySources = [
  { name: 'Serply', description: 'Google Jobs via search API' },
]

export function SourcesStep({ onValidChange }: StepProps) {
  useEffect(() => {
    // For this story: always report valid=true (actual key validation in Story 2.4)
    onValidChange(true)
  }, [onValidChange])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure job sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Open Sources (no API key needed)
          </h3>
          {openSources.map((source) => (
            <div
              key={source.name}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{source.name}</p>
                <p className="text-sm text-muted-foreground">{source.description}</p>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                Ready
              </Badge>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            API Key Required
          </h3>
          {keySources.map((source) => (
            <div
              key={source.name}
              className="space-y-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{source.name}</p>
                <p className="text-sm text-muted-foreground">{source.description}</p>
              </div>
              <Input placeholder="Enter API key (optional)" />
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Click &quot;Start Discovery&quot; to begin finding jobs from your configured sources.
        </p>
      </CardContent>
    </Card>
  )
}
