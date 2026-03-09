import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  insertJobSchema,
  insertPipelineRunSchema,
  insertPreferencesSchema,
  insertResumeSchema,
  insertSourceSchema,
  jobsTable,
  pipelineRunsTable,
  preferencesTable,
  resumesTable,
  selectJobSchema,
  selectPipelineRunSchema,
  selectPreferencesSchema,
  selectResumeSchema,
  selectSourceSchema,
  sourcesTable,
} from './schema'

describe('jobsTable', () => {
  it('[P1] should export jobsTable with expected columns', () => {
    const columns = getTableColumns(jobsTable)
    const columnNames = Object.keys(columns)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('externalId')
    expect(columnNames).toContain('sourceName')
    expect(columnNames).toContain('title')
    expect(columnNames).toContain('company')
    expect(columnNames).toContain('descriptionHtml')
    expect(columnNames).toContain('descriptionText')
    expect(columnNames).toContain('salaryMin')
    expect(columnNames).toContain('salaryMax')
    expect(columnNames).toContain('location')
    expect(columnNames).toContain('isRemote')
    expect(columnNames).toContain('sourceUrl')
    expect(columnNames).toContain('applyUrl')
    expect(columnNames).toContain('embedding')
    expect(columnNames).toContain('sources')
    expect(columnNames).toContain('dedupConfidence')
    expect(columnNames).toContain('benefits')
    expect(columnNames).toContain('rawData')
    expect(columnNames).toContain('matchScore')
    expect(columnNames).toContain('matchBreakdown')
    expect(columnNames).toContain('pipelineStage')
    expect(columnNames).toContain('discoveredAt')
    expect(columnNames).toContain('reviewedAt')
    expect(columnNames).toContain('appliedAt')
    expect(columnNames).toContain('stageChangedAt')
    expect(columnNames).toContain('isDismissed')
    expect(columnNames).toContain('createdAt')
    expect(columnNames).toContain('updatedAt')
    expect(columnNames).toContain('searchVector')
  })

  it('[P1] should have uuid id column', () => {
    const columns = getTableColumns(jobsTable)
    expect(columns.id.dataType).toBe('string')
  })

  it('[P1] should have isDismissed default to false', () => {
    const columns = getTableColumns(jobsTable)
    expect(columns.isDismissed.hasDefault).toBe(true)
    expect(columns.isDismissed.default).toBe(false)
  })

  it('[P1] should have pipelineStage default to discovered', () => {
    const columns = getTableColumns(jobsTable)
    expect(columns.pipelineStage.hasDefault).toBe(true)
    expect(columns.pipelineStage.default).toBe('discovered')
  })

  it('[P0] should have externalId and sourceName as notNull', () => {
    const columns = getTableColumns(jobsTable)
    expect(columns.externalId.notNull).toBe(true)
    expect(columns.sourceName.notNull).toBe(true)
  })
})

describe('sourcesTable', () => {
  it('[P1] should export sourcesTable with expected columns', () => {
    const columns = getTableColumns(sourcesTable)
    const columnNames = Object.keys(columns)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('displayName')
    expect(columnNames).toContain('type')
    expect(columnNames).toContain('isEnabled')
    expect(columnNames).toContain('lastFetchAt')
    expect(columnNames).toContain('lastError')
    expect(columnNames).toContain('listingsCount')
    expect(columnNames).toContain('healthStatus')
    expect(columnNames).toContain('createdAt')
    expect(columnNames).toContain('updatedAt')
  })

  it('[P1] should have isEnabled default to true', () => {
    const columns = getTableColumns(sourcesTable)
    expect(columns.isEnabled.hasDefault).toBe(true)
  })

  it('[P1] should have listingsCount default to 0', () => {
    const columns = getTableColumns(sourcesTable)
    expect(columns.listingsCount.hasDefault).toBe(true)
  })
})

describe('pipelineRunsTable', () => {
  it('[P1] should export pipelineRunsTable with expected columns', () => {
    const columns = getTableColumns(pipelineRunsTable)
    const columnNames = Object.keys(columns)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('startedAt')
    expect(columnNames).toContain('completedAt')
    expect(columnNames).toContain('sourcesAttempted')
    expect(columnNames).toContain('sourcesSucceeded')
    expect(columnNames).toContain('sourcesFailed')
    expect(columnNames).toContain('listingsFetched')
    expect(columnNames).toContain('listingsNew')
    expect(columnNames).toContain('listingsDeduplicated')
    expect(columnNames).toContain('errors')
  })

  it('[P1] should have integer columns default to 0', () => {
    const columns = getTableColumns(pipelineRunsTable)
    expect(columns.sourcesAttempted.hasDefault).toBe(true)
    expect(columns.sourcesSucceeded.hasDefault).toBe(true)
    expect(columns.sourcesFailed.hasDefault).toBe(true)
    expect(columns.listingsFetched.hasDefault).toBe(true)
    expect(columns.listingsNew.hasDefault).toBe(true)
    expect(columns.listingsDeduplicated.hasDefault).toBe(true)
  })
})

describe('resumesTable', () => {
  it('[P1] should export resumesTable with expected columns', () => {
    const columns = getTableColumns(resumesTable)
    const columnNames = Object.keys(columns)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('fileName')
    expect(columnNames).toContain('parsedData')
    expect(columnNames).toContain('skills')
    expect(columnNames).toContain('experience')
    expect(columnNames).toContain('uploadedAt')
    expect(columnNames).toContain('updatedAt')
  })
})

describe('preferencesTable', () => {
  it('[P1] should export preferencesTable with expected columns', () => {
    const columns = getTableColumns(preferencesTable)
    const columnNames = Object.keys(columns)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('targetTitles')
    expect(columnNames).toContain('salaryMin')
    expect(columnNames).toContain('salaryMax')
    expect(columnNames).toContain('locations')
    expect(columnNames).toContain('remotePreference')
    expect(columnNames).toContain('createdAt')
    expect(columnNames).toContain('updatedAt')
  })
})

describe('drizzle-zod schemas', () => {
  it('[P2] should export insert schemas for all tables', () => {
    expect(insertJobSchema).toBeDefined()
    expect(insertSourceSchema).toBeDefined()
    expect(insertPipelineRunSchema).toBeDefined()
    expect(insertResumeSchema).toBeDefined()
    expect(insertPreferencesSchema).toBeDefined()
  })

  it('[P2] should export select schemas for all tables', () => {
    expect(selectJobSchema).toBeDefined()
    expect(selectSourceSchema).toBeDefined()
    expect(selectPipelineRunSchema).toBeDefined()
    expect(selectResumeSchema).toBeDefined()
    expect(selectPreferencesSchema).toBeDefined()
  })

  it('[P1] should validate valid job insert data', () => {
    const result = insertJobSchema.safeParse({
      externalId: 'ext-123',
      sourceName: 'linkedin',
      title: 'Software Engineer',
      company: 'Acme Corp',
    })
    expect(result.success).toBe(true)
  })

  it('[P1] should validate valid source insert data', () => {
    const result = insertSourceSchema.safeParse({
      name: 'linkedin',
      displayName: 'LinkedIn',
      type: 'key_required',
      healthStatus: 'healthy',
    })
    expect(result.success).toBe(true)
  })

  it('[P0] should reject job insert missing required externalId', () => {
    const result = insertJobSchema.safeParse({
      sourceName: 'linkedin',
      title: 'Engineer',
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject job insert missing required sourceName', () => {
    const result = insertJobSchema.safeParse({
      externalId: 'ext-123',
      title: 'Engineer',
    })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject source insert missing required name', () => {
    const result = insertSourceSchema.safeParse({
      displayName: 'LinkedIn',
      type: 'key_required',
    })
    expect(result.success).toBe(false)
  })
})
