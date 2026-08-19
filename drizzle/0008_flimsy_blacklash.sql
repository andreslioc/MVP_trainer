ALTER TABLE "chat_coverage" ADD COLUMN "at_seconds" integer;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "at_seconds" integer;--> statement-breakpoint
ALTER TABLE "chat_coverage" ADD CONSTRAINT "chat_coverage_at_seconds_nonnegative" CHECK ("chat_coverage"."at_seconds" is null or "chat_coverage"."at_seconds" >= 0);--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_at_seconds_nonnegative" CHECK ("insights"."at_seconds" is null or "insights"."at_seconds" >= 0);