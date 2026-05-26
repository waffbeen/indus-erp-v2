CREATE TABLE IF NOT EXISTS "po_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"amendment_no" integer NOT NULL,
	"summary" text NOT NULL,
	"remark" text,
	"changed_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "po_type" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "for_delivery" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "credit_period_days" integer;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "insurance_terms" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "penalty_terms" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "packing_terms" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_amendments" ADD CONSTRAINT "po_amendments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_amendments" ADD CONSTRAINT "po_amendments_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_amendments" ADD CONSTRAINT "po_amendments_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_amendments_po_idx" ON "po_amendments" ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_amendments_tenant_idx" ON "po_amendments" ("tenant_id");