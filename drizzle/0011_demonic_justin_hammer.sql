ALTER TABLE "products" DROP CONSTRAINT "products_promo_percent_range";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_promo_needs_percent";--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "product_promos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "promo_active";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "promo_percent";