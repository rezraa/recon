-- Story 2-7: Normalizer & Confidence-Based Deduplicator
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
-- Rename description → description_html (preserve existing data)
ALTER TABLE "jobs" RENAME COLUMN "description" TO "description_html";
--> statement-breakpoint
-- Add description_text column (plain text for ML/search)
ALTER TABLE "jobs" ADD COLUMN "description_text" text;
--> statement-breakpoint
-- Rename url → source_url (preserve existing data)
ALTER TABLE "jobs" RENAME COLUMN "url" TO "source_url";
--> statement-breakpoint
-- Add apply_url column (application page URL)
ALTER TABLE "jobs" ADD COLUMN "apply_url" text;
--> statement-breakpoint
-- Add embedding column for pgvector (nullable, populated by Story 2-9)
ALTER TABLE "jobs" ADD COLUMN "embedding" vector(384);
--> statement-breakpoint
-- Add sources column for multi-source attribution
ALTER TABLE "jobs" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
-- Add dedup_confidence column (0.0-1.0 RRF score)
ALTER TABLE "jobs" ADD COLUMN "dedup_confidence" real;
--> statement-breakpoint
-- Add HNSW index for vector cosine similarity search
CREATE INDEX "idx_jobs_embedding" ON "jobs" USING hnsw ("embedding" vector_cosine_ops);
