'use client'

import { useEffect } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StepProps {
  onValidChange: (isValid: boolean) => void
}

export function PreferencesStep({ onValidChange }: StepProps) {
  useEffect(() => {
    // For this story: always report valid=true (actual validation in Story 2.3)
    onValidChange(true)
  }, [onValidChange])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set your job search preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="target-titles">
            Target Job Titles
          </label>
          <Input id="target-titles" placeholder="e.g. Frontend Engineer, Full Stack Developer" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="salary-min">
              Minimum Salary
            </label>
            <Input id="salary-min" type="number" placeholder="e.g. 80000" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="salary-max">
              Maximum Salary
            </label>
            <Input id="salary-max" type="number" placeholder="e.g. 150000" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="locations">
            Preferred Locations
          </label>
          <Input id="locations" placeholder="e.g. San Francisco, New York, Remote" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="remote-preference">
            Remote Preference
          </label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote-only">Remote Only</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
              <SelectItem value="on-site">On-site</SelectItem>
              <SelectItem value="no-preference">No Preference</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
