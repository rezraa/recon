'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePreferences } from '@/hooks/usePreferences'
import { preferencesSchema } from '@/lib/validations/preferences'

interface StepProps {
  onValidChange: (isValid: boolean) => void
}

interface FormErrors {
  target_titles?: string
  salary_min?: string
  salary_max?: string
  api?: string
}

export function PreferencesStep({ onValidChange }: StepProps) {
  const { data: existingPreferences, isLoading } = usePreferences()

  const [titles, setTitles] = useState<string[]>([])
  const [titleInput, setTitleInput] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [locationInput, setLocationInput] = useState('')
  const [remotePreference, setRemotePreference] = useState('no_preference')
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const hasPrePopulated = useRef(false)

  // Pre-populate from existing preferences (SWR)
  useEffect(() => {
    if (existingPreferences && !hasPrePopulated.current) {
      hasPrePopulated.current = true
      if (Array.isArray(existingPreferences.targetTitles)) {
        setTitles(existingPreferences.targetTitles)
      }
      if (existingPreferences.salaryMin != null) {
        setSalaryMin(String(existingPreferences.salaryMin))
      }
      if (existingPreferences.salaryMax != null) {
        setSalaryMax(String(existingPreferences.salaryMax))
      }
      if (Array.isArray(existingPreferences.locations)) {
        setLocations(existingPreferences.locations)
      }
      if (existingPreferences.remotePreference) {
        setRemotePreference(existingPreferences.remotePreference)
      }
    }
  }, [existingPreferences])

  // Report validity — false until save succeeds
  const stableOnValidChange = useCallback(onValidChange, [onValidChange])
  useEffect(() => {
    stableOnValidChange(false)
  }, [stableOnValidChange])

  const addTitle = useCallback(() => {
    const trimmed = titleInput.trim()
    if (!trimmed) return
    if (titles.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    setTitles((prev) => [...prev, trimmed])
    setTitleInput('')
    setErrors((prev) => ({ ...prev, target_titles: undefined }))
  }, [titleInput, titles])

  const removeTitle = useCallback((index: number) => {
    setTitles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const addLocation = useCallback(() => {
    const trimmed = locationInput.trim()
    if (!trimmed) return
    if (locations.some((l) => l.toLowerCase() === trimmed.toLowerCase())) return
    setLocations((prev) => [...prev, trimmed])
    setLocationInput('')
  }, [locationInput, locations])

  const removeLocation = useCallback((index: number) => {
    setLocations((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        addTitle()
      }
    },
    [addTitle],
  )

  const handleLocationKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        addLocation()
      }
    },
    [addLocation],
  )

  const handleSubmit = useCallback(async () => {
    setErrors({})

    const formData: Record<string, unknown> = {
      target_titles: titles,
      locations,
      remote_preference: remotePreference,
    }

    if (salaryMin) formData.salary_min = Number(salaryMin)
    if (salaryMax) formData.salary_max = Number(salaryMax)

    const validation = preferencesSchema.safeParse(formData)

    if (!validation.success) {
      const fieldErrors: FormErrors = {}
      for (const issue of validation.error.issues) {
        const path = issue.path[0] as string
        if (path === 'target_titles') {
          fieldErrors.target_titles = 'At least one target job title is required'
        } else if (path === 'salary_min') {
          fieldErrors.salary_min = issue.message
        } else if (path === 'salary_max') {
          fieldErrors.salary_max = issue.message
        }
      }
      setErrors(fieldErrors)
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const body = await res.json()
        if (res.status === 400 && body.error?.details) {
          const fieldErrors: FormErrors = {}
          for (const [key, msg] of Object.entries(body.error.details)) {
            if (key === 'target_titles') fieldErrors.target_titles = msg as string
            if (key === 'salary_min') fieldErrors.salary_min = msg as string
            if (key === 'salary_max') fieldErrors.salary_max = msg as string
          }
          setErrors(fieldErrors)
        } else {
          setErrors({ api: body.error?.message || 'Failed to save preferences' })
        }
        return
      }

      stableOnValidChange(true)
    } catch {
      setErrors({ api: 'Network error. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }, [titles, salaryMin, salaryMax, locations, remotePreference, stableOnValidChange])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading preferences...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set your job search preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target Job Titles */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="target-titles">
            Target Job Titles <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-2">
            <Input
              id="target-titles"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="Type a title and press Enter"
              aria-describedby={errors.target_titles ? 'title-error' : undefined}
            />
            <Button type="button" variant="secondary" onClick={addTitle} size="sm">
              Add
            </Button>
          </div>
          {titles.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="title-chips">
              {titles.map((title, i) => (
                <Badge key={title} variant="secondary" className="gap-1">
                  {title}
                  <button
                    type="button"
                    onClick={() => removeTitle(i)}
                    className="ml-1 hover:text-destructive"
                    aria-label={`Remove ${title}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {errors.target_titles && (
            <p id="title-error" className="text-sm text-destructive">
              {errors.target_titles}
            </p>
          )}
        </div>

        {/* Salary Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="salary-min">
              Minimum Salary
            </label>
            <Input
              id="salary-min"
              type="number"
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              placeholder="e.g. 80000"
              min={0}
            />
            {errors.salary_min && (
              <p className="text-sm text-destructive">{errors.salary_min}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="salary-max">
              Maximum Salary
            </label>
            <Input
              id="salary-max"
              type="number"
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              placeholder="e.g. 150000"
              min={0}
            />
            {errors.salary_max && (
              <p className="text-sm text-destructive">{errors.salary_max}</p>
            )}
          </div>
        </div>

        {/* Preferred Locations */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="locations">
            Preferred Locations
          </label>
          <div className="flex gap-2">
            <Input
              id="locations"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={handleLocationKeyDown}
              placeholder="Type a location and press Enter"
            />
            <Button type="button" variant="secondary" onClick={addLocation} size="sm">
              Add
            </Button>
          </div>
          {locations.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="location-chips">
              {locations.map((loc, i) => (
                <Badge key={loc} variant="secondary" className="gap-1">
                  {loc}
                  <button
                    type="button"
                    onClick={() => removeLocation(i)}
                    className="ml-1 hover:text-destructive"
                    aria-label={`Remove ${loc}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Remote Preference */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="remote-preference">
            Remote Preference
          </label>
          <Select value={remotePreference} onValueChange={setRemotePreference}>
            <SelectTrigger id="remote-preference">
              <SelectValue placeholder="Select preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote_only">Remote Only</SelectItem>
              <SelectItem value="hybrid_ok">Hybrid OK</SelectItem>
              <SelectItem value="onsite_ok">On-site OK</SelectItem>
              <SelectItem value="no_preference">No Preference</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* API Error */}
        {errors.api && (
          <div className="rounded border border-destructive bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{errors.api}</p>
          </div>
        )}

        {/* Submit */}
        <Button onClick={handleSubmit} disabled={isSaving} className="w-full">
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </CardContent>
    </Card>
  )
}
