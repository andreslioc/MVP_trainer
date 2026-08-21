ALTER TABLE "products" ADD COLUMN "price_cop" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "promo_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "promo_percent" integer;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_positive" CHECK ("products"."price_cop" is null or "products"."price_cop" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_promo_percent_range" CHECK ("products"."promo_percent" is null or ("products"."promo_percent" >= 1 and "products"."promo_percent" <= 99));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_promo_needs_percent" CHECK (not "products"."promo_active" or "products"."promo_percent" is not null);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_verified_needs_price" CHECK ("products"."verified_at" is null or "products"."price_cop" is not null);