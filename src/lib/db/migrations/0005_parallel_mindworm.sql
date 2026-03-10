CREATE TABLE "company_intel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"glassdoor_rating" text,
	"company_size" text,
	"funding" text,
	"tech_stack" text,
	"growth" text,
	"recent_news" text,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_company_intel_company_name" ON "company_intel" USING btree ("company_name");