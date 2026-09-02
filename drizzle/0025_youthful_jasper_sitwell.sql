ALTER TABLE "products" ALTER COLUMN "full_answer" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "active_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_active_seconds_sane" CHECK ("training_sessions"."active_seconds" between 0 and 86400);