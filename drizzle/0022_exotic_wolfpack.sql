ALTER TABLE "products" ADD COLUMN "caution_guidance" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "avoid_guidance" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "advisor_summary" text DEFAULT '' NOT NULL;