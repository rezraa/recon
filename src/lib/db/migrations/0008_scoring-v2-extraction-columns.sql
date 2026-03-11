-- Add extracted_profile column to jobs table for v2 symmetric extraction caching
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "extracted_profile" jsonb;

-- Add resume_extraction column to resumes table for cached LLM profile extraction
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "resume_extraction" jsonb;

-- Drop old v1 extracted_requirements column (replaced by extracted_profile in v2)
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "extracted_requirements";
