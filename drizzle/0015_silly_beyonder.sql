ALTER TABLE "training_sessions" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "training_sessions_category_idx" ON "training_sessions" USING btree ("category");--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_target_exclusive" CHECK (num_nonnulls("training_sessions"."product_id", "training_sessions"."category") = 1);