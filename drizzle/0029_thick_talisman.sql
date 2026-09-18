CREATE TABLE "pretraining_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"study_date" date NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pretraining_activity_seconds_sane" CHECK ("pretraining_activity"."active_seconds" between 0 and 86400)
);
--> statement-breakpoint
ALTER TABLE "pretraining_activity" ADD CONSTRAINT "pretraining_activity_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pretraining_activity" ADD CONSTRAINT "pretraining_activity_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pretraining_activity_advisor_product_day_unique" ON "pretraining_activity" USING btree ("advisor_id","product_id","study_date");--> statement-breakpoint
CREATE INDEX "pretraining_activity_advisor_day_idx" ON "pretraining_activity" USING btree ("advisor_id","study_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pretraining_activity_product_id_idx" ON "pretraining_activity" USING btree ("product_id");