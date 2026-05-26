CREATE TABLE IF NOT EXISTS "po_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_paise" text DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_charges" ADD CONSTRAINT "po_charges_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_charges_po_idx" ON "po_charges" ("po_id");