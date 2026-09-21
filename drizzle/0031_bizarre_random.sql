CREATE TABLE "weekly_training_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"training_sessions_target" integer DEFAULT 0 NOT NULL,
	"pretraining_minutes_target" integer DEFAULT 0 NOT NULL,
	"products_target" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_training_goals_targets_sane" CHECK ("weekly_training_goals"."training_sessions_target" between 0 and 100 and "weekly_training_goals"."pretraining_minutes_target" between 0 and 10080 and "weekly_training_goals"."products_target" between 0 and 500),
	CONSTRAINT "weekly_training_goals_has_target" CHECK ("weekly_training_goals"."training_sessions_target" > 0 or "weekly_training_goals"."pretraining_minutes_target" > 0 or "weekly_training_goals"."products_target" > 0)
);
--> statement-breakpoint
ALTER TABLE "weekly_training_goals" ADD CONSTRAINT "weekly_training_goals_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_training_goals" ADD CONSTRAINT "weekly_training_goals_created_by_advisors_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."advisors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_training_goals_advisor_week_unique" ON "weekly_training_goals" USING btree ("advisor_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_training_goals_week_idx" ON "weekly_training_goals" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "weekly_training_goals_created_by_idx" ON "weekly_training_goals" USING btree ("created_by");