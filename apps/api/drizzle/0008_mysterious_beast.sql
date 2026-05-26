ALTER TABLE "tenants" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "grn_items" ADD COLUMN "batch_number" text;--> statement-breakpoint
ALTER TABLE "grn_items" ADD COLUMN "mfg_date" timestamp;--> statement-breakpoint
ALTER TABLE "grn_items" ADD COLUMN "expiry_date" timestamp;