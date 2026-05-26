ALTER TABLE "po_items" ADD COLUMN "tolerance_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "warranty_months" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "is_for_stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "is_recovery_rate" integer DEFAULT 0 NOT NULL;