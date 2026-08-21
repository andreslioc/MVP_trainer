CREATE TYPE "public"."simulation_speed" AS ENUM('despacio', 'normal', 'rapido', 'aleatorio');--> statement-breakpoint
CREATE TABLE "live_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"speed" "simulation_speed" NOT NULL,
	"duration_s" integer NOT NULL,
	"script" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chat_log" text,
	"transcript" text,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_simulations_duration_positive" CHECK ("live_simulations"."duration_s" > 0)
);
--> statement-breakpoint
ALTER TABLE "live_simulations" ADD CONSTRAINT "live_simulations_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_simulations_advisor_started_idx" ON "live_simulations" USING btree ("advisor_id","started_at" DESC NULLS LAST);