CREATE TABLE IF NOT EXISTS "gate_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"gate_entry_number" text,
	"type" text DEFAULT 'inward' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"vendor_id" uuid,
	"po_id" uuid,
	"vehicle_number" text,
	"driver_name" text,
	"driver_phone" text,
	"invoice_number" text,
	"invoice_date" timestamp,
	"remarks" text,
	"gate_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gate_out_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gate_entry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gate_entry_id" uuid NOT NULL,
	"item_id" uuid,
	"item_name" text NOT NULL,
	"description" text,
	"quantity_scaled" integer NOT NULL,
	"uom" text DEFAULT 'nos' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grn_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_id" uuid NOT NULL,
	"po_item_id" uuid,
	"item_id" uuid,
	"item_name" text NOT NULL,
	"uom" text NOT NULL,
	"ordered_quantity_scaled" integer DEFAULT 0 NOT NULL,
	"received_quantity_scaled" integer NOT NULL,
	"accepted_quantity_scaled" integer NOT NULL,
	"rejected_quantity_scaled" integer DEFAULT 0 NOT NULL,
	"unit_price_paise" text DEFAULT '0' NOT NULL,
	"condition" text DEFAULT 'good' NOT NULL,
	"remarks" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"gate_entry_id" uuid,
	"received_by_user_id" uuid NOT NULL,
	"grn_number" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"invoice_number" text,
	"invoice_date" timestamp,
	"invoice_amount_paise" text,
	"received_date" timestamp NOT NULL,
	"remarks" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entry_items" ADD CONSTRAINT "gate_entry_items_gate_entry_id_gate_entries_id_fk" FOREIGN KEY ("gate_entry_id") REFERENCES "public"."gate_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_entry_items" ADD CONSTRAINT "gate_entry_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_po_item_id_po_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."po_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_gate_entry_id_gate_entries_id_fk" FOREIGN KEY ("gate_entry_id") REFERENCES "public"."gate_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_entries_tenant_idx" ON "gate_entries" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_entries_tenant_status_idx" ON "gate_entries" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_entries_vendor_idx" ON "gate_entries" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_entries_po_idx" ON "gate_entries" ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_entries_number_idx" ON "gate_entries" ("tenant_id","gate_entry_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_entries_gate_in_idx" ON "gate_entries" ("gate_in_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_entry_items_ge_idx" ON "gate_entry_items" ("gate_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_items_grn_idx" ON "grn_items" ("grn_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_items_po_item_idx" ON "grn_items" ("po_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grns_tenant_idx" ON "grns" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grns_tenant_status_idx" ON "grns" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grns_po_idx" ON "grns" ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grns_vendor_idx" ON "grns" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grns_number_idx" ON "grns" ("tenant_id","grn_number");