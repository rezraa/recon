ALTER TABLE "company_intel" RENAME COLUMN "tech_stack" TO "industry";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "extracted_requirements" jsonb;
