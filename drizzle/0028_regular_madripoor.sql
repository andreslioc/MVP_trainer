ALTER TABLE "products" ADD COLUMN "stock_units" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "products_stock_units_idx" ON "products" USING btree ("stock_units");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_not_negative" CHECK ("products"."stock_units" is null or "products"."stock_units" >= 0);