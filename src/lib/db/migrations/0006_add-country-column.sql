ALTER TABLE "jobs" ADD COLUMN "country" text;--> statement-breakpoint
CREATE INDEX "idx_jobs_country" ON "jobs" USING btree ("country");