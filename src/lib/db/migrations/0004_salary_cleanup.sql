-- Retroactive salary cleanup: NULL out obviously wrong salary values
-- salaryMin > $500k and salaryMax > $1M are suspect (e.g., $1.6M salaryMin)
UPDATE "jobs" SET "salary_min" = NULL WHERE "salary_min" > 500000;--> statement-breakpoint
UPDATE "jobs" SET "salary_max" = NULL WHERE "salary_max" > 1000000;