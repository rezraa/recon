import { describe, expect, it } from 'vitest'

import { createJob } from './job.factory'
import { createPreferences } from './preferences.factory'
import { createResume } from './resume.factory'
import { createSource } from './source.factory'

describe('data factories', () => {
  describe('createResume', () => {
    it('[P0] returns a valid resume shape', () => {
      const resume = createResume()

      expect(resume.id).toBeDefined()
      expect(typeof resume.id).toBe('string')
      expect(resume.fileName).toMatch(/\.pdf$/)
      expect(resume.parsedData).toBeDefined()
      expect(resume.skills).toBeInstanceOf(Array)
      expect(resume.experience).toBeInstanceOf(Array)
      expect(resume.uploadedAt).toBeInstanceOf(Date)
      expect(resume.updatedAt).toBeInstanceOf(Date)
    })

    it('[P0] allows overrides', () => {
      const resume = createResume({
        fileName: 'custom.pdf',
        skills: ['Go', 'Rust'],
      })

      expect(resume.fileName).toBe('custom.pdf')
      expect(resume.skills).toEqual(['Go', 'Rust'])
    })

    it('[P0] generates unique IDs on each call', () => {
      const r1 = createResume()
      const r2 = createResume()

      expect(r1.id).not.toBe(r2.id)
    })
  })

  describe('createJob', () => {
    it('[P0] returns a valid job shape', () => {
      const job = createJob()

      expect(job.id).toBeDefined()
      expect(typeof job.externalId).toBe('string')
      expect(typeof job.sourceName).toBe('string')
      expect(typeof job.title).toBe('string')
      expect(job.pipelineStage).toBe('discovered')
      expect(job.isDismissed).toBe(false)
    })

    it('[P0] allows overrides', () => {
      const job = createJob({
        title: 'Data Scientist',
        matchScore: 95,
      })

      expect(job.title).toBe('Data Scientist')
      expect(job.matchScore).toBe(95)
    })

    it('[P0] generates unique IDs and externalIds on each call', () => {
      const j1 = createJob()
      const j2 = createJob()

      expect(j1.id).not.toBe(j2.id)
      expect(j1.externalId).not.toBe(j2.externalId)
    })
  })

  describe('createSource', () => {
    it('[P0] returns a valid source shape', () => {
      const source = createSource()

      expect(source.id).toBeDefined()
      expect(typeof source.name).toBe('string')
      expect(source.isEnabled).toBe(true)
      expect(source.healthStatus).toBe('healthy')
    })

    it('[P0] allows overrides', () => {
      const source = createSource({
        name: 'linkedin',
        displayName: 'LinkedIn',
        type: 'scraper',
      })

      expect(source.name).toBe('linkedin')
      expect(source.displayName).toBe('LinkedIn')
      expect(source.type).toBe('scraper')
    })

    it('[P0] generates unique IDs and names on each call', () => {
      const s1 = createSource()
      const s2 = createSource()

      expect(s1.id).not.toBe(s2.id)
      expect(s1.name).not.toBe(s2.name)
    })
  })

  describe('createPreferences', () => {
    it('[P0] returns a valid preferences shape', () => {
      const prefs = createPreferences()

      expect(prefs.id).toBeDefined()
      expect(typeof prefs.id).toBe('string')
      expect(prefs.targetTitles).toBeInstanceOf(Array)
      expect(typeof prefs.salaryMin).toBe('number')
      expect(typeof prefs.salaryMax).toBe('number')
      expect(prefs.locations).toBeInstanceOf(Array)
      expect(typeof prefs.remotePreference).toBe('string')
      expect(prefs.createdAt).toBeInstanceOf(Date)
      expect(prefs.updatedAt).toBeInstanceOf(Date)
    })

    it('[P0] allows overrides', () => {
      const prefs = createPreferences({
        targetTitles: ['CTO'],
        salaryMin: 200000,
        remotePreference: 'remote_only',
      })

      expect(prefs.targetTitles).toEqual(['CTO'])
      expect(prefs.salaryMin).toBe(200000)
      expect(prefs.remotePreference).toBe('remote_only')
    })

    it('[P0] generates unique IDs on each call', () => {
      const p1 = createPreferences()
      const p2 = createPreferences()

      expect(p1.id).not.toBe(p2.id)
    })

    it('[P0] ensures updatedAt >= createdAt', () => {
      const prefs = createPreferences()
      expect(prefs.updatedAt!.getTime()).toBeGreaterThanOrEqual(prefs.createdAt!.getTime())
    })
  })
})
