ALTER TABLE "products" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");