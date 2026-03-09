'use client'

import { Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useResumeUpload } from '@/hooks/useResumeUpload'
import type { ExperienceEntry } from '@/lib/pipeline/resumeTypes'

interface StepProps {
  onValidChange: (isValid: boolean) => void
}

const MAX_FILE_SIZE = 5 * 1024 * 1024

export function ResumeStep({ onValidChange }: StepProps) {
  const { upload, isUploading, parsedData, error: uploadError, reset } = useResumeUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  // Editable state
  const [skills, setSkills] = useState<string[]>([])
  const [experience, setExperience] = useState<ExperienceEntry[]>([])
  const [jobTitles, setJobTitles] = useState<string[]>([])
  const [newSkill, setNewSkill] = useState('')

  // Sync parsed data into editable state when it changes
  useEffect(() => {
    if (parsedData) {
      /* eslint-disable react-hooks/set-state-in-effect -- intentional sync from external data */
      setSkills(parsedData.skills)
      setExperience(parsedData.experience)
      setJobTitles(parsedData.jobTitles)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [parsedData])

  // Report validity: valid only after successful parse
  useEffect(() => {
    onValidChange(parsedData !== null)
  }, [parsedData, onValidChange])

  const validateAndUpload = useCallback((file: File) => {
    setClientError(null)

    const name = file.name.toLowerCase()
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      setClientError('Please upload a PDF or DOCX file')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setClientError('File size exceeds 5MB limit')
      return
    }

    upload(file)
  }, [upload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndUpload(file)
  }, [validateAndUpload])

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) validateAndUpload(file)
    // Reset input so re-uploading same file triggers change
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [validateAndUpload])

  const handleRemoveSkill = useCallback((index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleAddSkill = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && newSkill.trim()) {
      e.preventDefault()
      const trimmed = newSkill.trim().replace(/,$/, '')
      if (trimmed && !skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
        setSkills((prev) => [...prev, trimmed])
      }
      setNewSkill('')
    }
  }, [newSkill, skills])

  const handleExperienceChange = useCallback(
    (index: number, field: keyof ExperienceEntry, value: string) => {
      setExperience((prev) =>
        prev.map((entry, i) => {
          if (i !== index) return entry
          if (field === 'years') {
            const num = parseInt(value, 10)
            return { ...entry, years: isNaN(num) ? null : num }
          }
          return { ...entry, [field]: value }
        }),
      )
    },
    [],
  )

  // Save error state (must be declared before displayError)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleReUpload = useCallback(() => {
    reset()
    setSkills([])
    setExperience([])
    setJobTitles([])
    setClientError(null)
    setSaveError(null)
  }, [reset])

  const displayError = clientError || uploadError || saveError

  // Save confirmed data with debounce when edits happen, and on unmount as fallback
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDataRef = useRef({ skills, experience, jobTitles })

  useEffect(() => {
    latestDataRef.current = { skills, experience, jobTitles }
  }, [skills, experience, jobTitles])

  const saveConfirmedData = useCallback(() => {
    const data = latestDataRef.current
    fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsedData: data }),
    })
      .then((res) => {
        if (!res.ok) setSaveError('Failed to save changes')
        else setSaveError(null)
      })
      .catch(() => setSaveError('Failed to save changes'))
  }, [])

  // Debounced save on edits (only after initial parse)
  const hasBeenEdited = useRef(false)
  useEffect(() => {
    if (!parsedData) return
    // Skip the initial sync from parsedData
    if (!hasBeenEdited.current) {
      hasBeenEdited.current = true
      return
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(saveConfirmedData, 1000)
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [skills, experience, jobTitles, parsedData, saveConfirmedData])

  // Save on unmount as fallback
  useEffect(() => {
    if (!parsedData) return
    return () => { saveConfirmedData() }
  }, [parsedData, saveConfirmedData])

  return (
    <Card data-resume-step>
      <CardHeader>
        <CardTitle>Upload your resume PDF to get started</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Zone */}
        {!parsedData && !isUploading && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drop your resume here or click to browse
              </p>
              <p className="text-xs text-muted-foreground">PDF or DOCX, up to 5MB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={handleFileChange}
              data-testid="file-input"
            />
          </>
        )}

        {/* Loading Skeleton */}
        {isUploading && (
          <div className="space-y-4" data-testid="upload-skeleton">
            <Skeleton className="h-6 w-32" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {/* Error Display */}
        {displayError && (
          <p className="text-sm text-destructive" data-testid="upload-error">
            {displayError}
          </p>
        )}

        {/* Parsed Data Confirmation UI */}
        {parsedData && !isUploading && (
          <div className="space-y-6">
            {/* Re-upload button */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleReUpload}>
                Upload different resume
              </Button>
            </div>

            {/* Skills Section */}
            <div>
              <h3 className="mb-2 text-sm font-medium">Skills</h3>
              <div className="mb-2 flex flex-wrap gap-2">
                {skills.map((skill, index) => (
                  <Badge key={`${skill}-${index}`} variant="secondary" className="gap-1">
                    {skill}
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(index)}
                      className="ml-1 rounded-full hover:bg-muted"
                      aria-label={`Remove ${skill}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Add a skill (press Enter)"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={handleAddSkill}
                data-testid="add-skill-input"
              />
            </div>

            {/* Experience Section */}
            {experience.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Experience</h3>
                <div className="space-y-3">
                  {experience.map((entry, index) => (
                    <div key={index} className="grid grid-cols-3 gap-2">
                      <Input
                        value={entry.title}
                        onChange={(e) => handleExperienceChange(index, 'title', e.target.value)}
                        placeholder="Title"
                        aria-label="Job title"
                      />
                      <Input
                        value={entry.company}
                        onChange={(e) => handleExperienceChange(index, 'company', e.target.value)}
                        placeholder="Company"
                        aria-label="Company"
                      />
                      <Input
                        value={entry.years?.toString() ?? ''}
                        onChange={(e) => handleExperienceChange(index, 'years', e.target.value)}
                        placeholder="Years"
                        type="number"
                        aria-label="Years"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Job Titles Section */}
            {jobTitles.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Extracted Job Titles</h3>
                <div className="flex flex-wrap gap-2">
                  {jobTitles.map((title, index) => (
                    <Badge key={`${title}-${index}`} variant="outline">
                      {title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
