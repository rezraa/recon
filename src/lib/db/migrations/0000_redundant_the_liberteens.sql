CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"source_name" text NOT NULL,
	"title" text,
	"company" text,
	"description" text,
	"salary_min" integer,
	"salary_max" integer,
	"location" text,
	"is_remote" boolean DEFAULT false,
	"url" text,
	"benefits" jsonb,
	"raw_data" jsonb,
	"match_score" integer,
	"match_breakdown" jsonb,
	"pipeline_stage" text DEFAULT 'discovered',
	"discovered_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"stage_changed_at" timestamp with time zone,
	"is_dismissed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"search_vector" "tsvector"
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"sources_attempted" integer DEFAULT 0,
	"sources_succeeded" integer DEFAULT 0,
	"sources_failed" integer DEFAULT 0,
	"listings_fetched" integer DEFAULT 0,
	"listings_new" integer DEFAULT 0,
	"listings_deduplicated" integer DEFAULT 0,
	"errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_titles" jsonb,
	"salary_min" integer,
	"salary_max" integer,
	"locations" jsonb,
	"remote_preference" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text,
	"parsed_data" jsonb,
	"skills" jsonb,
	"experience" jsonb,
	"uploaded_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"type" text,
	"is_enabled" boolean DEFAULT true,
	"last_fetch_at" timestamp with time zone,
	"last_error" jsonb,
	"listings_count" integer DEFAULT 0,
	"health_status" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "idx_jobs_match_score" ON "jobs" USING btree ("match_score");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_jobs_source_name_external_id" ON "jobs" USING btree ("source_name","external_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_pipeline_stage" ON "jobs" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX "idx_jobs_search_vector" ON "jobs" USING gin ("search_vector");