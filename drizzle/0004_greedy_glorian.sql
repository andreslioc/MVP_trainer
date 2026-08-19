CREATE TABLE "chat_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answered" boolean NOT NULL,
	"evidence_quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_recordings" ADD COLUMN "chat_log" text;--> statement-breakpoint
ALTER TABLE "chat_coverage" ADD CONSTRAINT "chat_coverage_recording_id_live_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."live_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_coverage_recording_idx" ON "chat_coverage" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "chat_coverage_answered_idx" ON "chat_coverage" USING btree ("recording_id","answered");