ALTER TABLE "items" ADD COLUMN "item_group_name" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "item_sub_group_name" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "stock_unit" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "purchase_unit" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "conversion_factor" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "item_specifications" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_asset" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_service" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "item_group_name" text;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "item_sub_group_name" text;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "stock_unit" text;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "purchase_unit" text;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "last_purchase_rate_paise" text;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "last_purchase_date" timestamp;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "item_narration" text;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "line_buyer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_items" ADD COLUMN "specifications" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD COLUMN "pr_type" text DEFAULT 'stock' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD COLUMN "reference_no" text;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD COLUMN "buyer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "item_group_name" text;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "item_sub_group_name" text;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "discount_amount_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "cgst_rate" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "sgst_rate" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "igst_rate" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "taxable_amount_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "cgst_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "sgst_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "igst_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "committed_delivery_date" timestamp;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "item_narration" text;--> statement-breakpoint
ALTER TABLE "po_items" ADD COLUMN "specifications" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "is_interstate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "place_of_supply" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "discount_total_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "taxable_amount_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cgst_total_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "sgst_total_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "igst_total_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "freight_charges_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "other_charges_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "round_off_paise" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "valid_until" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "delivery_terms" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "terms_and_conditions" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "parent_po_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "revision_no" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "revision_remark" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pr_items" ADD CONSTRAINT "pr_items_line_buyer_user_id_users_id_fk" FOREIGN KEY ("line_buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
