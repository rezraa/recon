-- Add partial column to jobs table for search-triggered external results
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "partial" boolean DEFAULT false;

-- Add enrichment_attempted_at column to jobs table for per-job enrichment guard
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "enrichment_attempted_at" timestamp with time zone;

-- Index for filtering partial/non-partial jobs in queries
CREATE INDEX IF NOT EXISTS "idx_jobs_partial" ON "jobs" ("partial");
