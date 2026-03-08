'use client'

import { Check, ExternalLink, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getKeyRequiredSources, getOpenSources } from '@/lib/adapters/registry'
import type { SourceConfig } from '@/lib/adapters/types'

interface StepProps {
  onValidChange: (isValid: boolean) => void
  onSkip?: () => void
}

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid'

function LetterAvatar({ name }: { name: string }) {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
  ]
  const colorIndex = name.charCodeAt(0) % colors.length

  return (
    <div
      aria-hidden="true"
      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${colors[colorIndex]}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function SourcesStep({ onValidChange, onSkip }: StepProps) {
  const openSources = getOpenSources()
  const keySources = getKeyRequiredSources()

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [validationStates, setValidationStates] = useState<Record<string, ValidationState>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Sources step is always valid — open sources are pre-enabled
    onValidChange(true)
  }, [onValidChange])

  const handleApiKeyChange = useCallback((sourceName: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [sourceName]: value }))
    // Reset validation when key changes
    setValidationStates((prev) => ({ ...prev, [sourceName]: 'idle' }))
    setValidationErrors((prev) => ({ ...prev, [sourceName]: '' }))
  }, [])

  const handleValidate = useCallback(async (sourceName: string) => {
    const key = apiKeys[sourceName]
    if (!key?.trim()) return

    setValidationStates((prev) => ({ ...prev, [sourceName]: 'validating' }))
    setValidationErrors((prev) => ({ ...prev, [sourceName]: '' }))

    try {
      const res = await fetch('/api/sources/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceName, apiKey: key }),
      })

      const json = await res.json()

      if (json.data?.valid) {
        setValidationStates((prev) => ({ ...prev, [sourceName]: 'valid' }))
      } else {
        setValidationStates((prev) => ({ ...prev, [sourceName]: 'invalid' }))
        setValidationErrors((prev) => ({
          ...prev,
          [sourceName]: json.error?.message || 'Invalid API key \u2014 please check and try again',
        }))
      }
    } catch {
      setValidationStates((prev) => ({ ...prev, [sourceName]: 'invalid' }))
      setValidationErrors((prev) => ({
        ...prev,
        [sourceName]: 'Unable to validate \u2014 please try again',
      }))
    }
  }, [apiKeys])

  const [saveError, setSaveError] = useState<string | null>(null)

  const saveApiKeys = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const validKeys = Object.entries(apiKeys).filter(
        ([name]) => validationStates[name] === 'valid',
      )

      for (const [name, key] of validKeys) {
        const res = await fetch(`/api/sources/${name}/config`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ apiKey: key }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          throw new Error(json?.error?.message || `Failed to save API key for ${name}`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save API keys'
      setSaveError(message)
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [apiKeys, validationStates])

  // Expose saveApiKeys for the wizard to call before handleStartDiscovery
  useEffect(() => {
    const handler = async () => {
      await saveApiKeys()
    }
    window.__saveSourceApiKeys = handler
    return () => {
      delete window.__saveSourceApiKeys
    }
  }, [saveApiKeys])

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
            <OpenSourceRow key={source.name} source={source} />
          ))}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            API Key Required
          </h3>
          {keySources.map((source) => (
            <KeySourceRow
              key={source.name}
              source={source}
              apiKey={apiKeys[source.name] || ''}
              validationState={validationStates[source.name] || 'idle'}
              validationError={validationErrors[source.name] || ''}
              onApiKeyChange={(value) => handleApiKeyChange(source.name, value)}
              onValidate={() => handleValidate(source.name)}
            />
          ))}
        </div>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Skip for now
          </button>
        )}
        {saveError && (
          <div role="alert" className="text-sm text-destructive">
            {saveError} — please retry.
          </div>
        )}
        {isSaving && (
          <p className="text-sm text-muted-foreground">Saving API keys...</p>
        )}
        <p className="text-sm text-muted-foreground">
          Click &quot;Start Discovery&quot; to begin finding jobs from your configured sources.
        </p>
      </CardContent>
    </Card>
  )
}

function OpenSourceRow({ source }: { source: SourceConfig }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <LetterAvatar name={source.displayName} />
      <div className="flex-1">
        <p className="font-medium">{source.displayName}</p>
        <p className="text-sm text-muted-foreground">{source.description}</p>
      </div>
      <div className="flex items-center gap-1 text-sm text-green-600">
        <Check className="h-4 w-4" />
        Enabled
      </div>
    </div>
  )
}

function KeySourceRow({
  source,
  apiKey,
  validationState,
  validationError,
  onApiKeyChange,
  onValidate,
}: {
  source: SourceConfig
  apiKey: string
  validationState: ValidationState
  validationError: string
  onApiKeyChange: (value: string) => void
  onValidate: () => void
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <LetterAvatar name={source.displayName} />
        <div className="flex-1">
          <p className="font-medium">{source.displayName}</p>
          <p className="text-sm text-muted-foreground">{source.description}</p>
        </div>
        {validationState === 'valid' && (
          <div role="status" className="flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Valid
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={`API key for ${source.displayName}`}
          placeholder="Enter API key"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          className="h-9"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={onValidate}
          disabled={!apiKey.trim() || validationState === 'validating'}
          className="h-9"
        >
          {validationState === 'validating' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Validate'
          )}
        </Button>
      </div>
      {validationState === 'invalid' && validationError && (
        <div role="alert" className="flex items-center gap-1 text-sm text-destructive">
          <X className="h-3 w-3" />
          {validationError}
        </div>
      )}
      {source.signupUrl && (
        <a
          href={source.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline hover:text-foreground"
        >
          Get Free Key
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

// Type augmentation for window
declare global {
  interface Window {
    __saveSourceApiKeys?: () => Promise<void>
  }
}
