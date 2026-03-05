import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

// Custom tsvector type for full-text search
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

// ─── Jobs Table ───────────────────────────────────────────────────────────────

export const jobsTable = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull(),
    sourceName: text('source_name').notNull(),
    title: text('title'),
    company: text('company'),
    description: text('description'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    location: text('location'),
    isRemote: boolean('is_remote').default(false),
    url: text('url'),
    benefits: jsonb('benefits'),
    rawData: jsonb('raw_data'),
    matchScore: integer('match_score'),
    matchBreakdown: jsonb('match_breakdown'),
    pipelineStage: text('pipeline_stage').default('discovered'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }),
    isDismissed: boolean('is_dismissed').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    searchVector: tsvector('search_vector'),
  },
  (table) => [
    index('idx_jobs_match_score').on(table.matchScore),
    uniqueIndex('idx_jobs_source_name_external_id').on(table.sourceName, table.externalId),
    index('idx_jobs_pipeline_stage').on(table.pipelineStage),
    index('idx_jobs_search_vector').using('gin', sql`${table.searchVector}`),
  ],
)

// ─── Sources Table ────────────────────────────────────────────────────────────

export const sourcesTable = pgTable('sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').unique().notNull(),
  displayName: text('display_name'),
  type: text('type'),
  isEnabled: boolean('is_enabled').default(true),
  lastFetchAt: timestamp('last_fetch_at', { withTimezone: true }),
  lastError: jsonb('last_error'),
  listingsCount: integer('listings_count').default(0),
  healthStatus: text('health_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── Pipeline Runs Table ──────────────────────────────────────────────────────

export const pipelineRunsTable = pgTable('pipeline_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  sourcesAttempted: integer('sources_attempted').default(0),
  sourcesSucceeded: integer('sources_succeeded').default(0),
  sourcesFailed: integer('sources_failed').default(0),
  listingsFetched: integer('listings_fetched').default(0),
  listingsNew: integer('listings_new').default(0),
  listingsDeduplicated: integer('listings_deduplicated').default(0),
  errors: jsonb('errors'),
})

// ─── Resumes Table ────────────────────────────────────────────────────────────

export const resumesTable = pgTable('resumes', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileName: text('file_name'),
  parsedData: jsonb('parsed_data'),
  skills: jsonb('skills'),
  experience: jsonb('experience'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── Preferences Table ────────────────────────────────────────────────────────

export const preferencesTable = pgTable('preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  targetTitles: jsonb('target_titles'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  locations: jsonb('locations'),
  remotePreference: text('remote_preference'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── Drizzle-Zod Schemas ─────────────────────────────────────────────────────

export const insertJobSchema = createInsertSchema(jobsTable)
export const selectJobSchema = createSelectSchema(jobsTable)

export const insertSourceSchema = createInsertSchema(sourcesTable)
export const selectSourceSchema = createSelectSchema(sourcesTable)

export const insertPipelineRunSchema = createInsertSchema(pipelineRunsTable)
export const selectPipelineRunSchema = createSelectSchema(pipelineRunsTable)

export const insertResumeSchema = createInsertSchema(resumesTable)
export const selectResumeSchema = createSelectSchema(resumesTable)

export const insertPreferencesSchema = createInsertSchema(preferencesTable)
export const selectPreferencesSchema = createSelectSchema(preferencesTable)
