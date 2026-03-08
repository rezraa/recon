ALTER TABLE "sources" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "error_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "consecutive_errors" integer DEFAULT 0;