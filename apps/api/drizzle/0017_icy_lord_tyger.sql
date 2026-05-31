CREATE TABLE IF NOT EXISTS "tenant_gst_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'nic_sandbox' NOT NULL,
	"username" text,
	"password_cipher" text,
	"gstin" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_test_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_gst_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "e_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"doc_number" text,
	"irn" text,
	"ack_no" text,
	"ack_date" timestamp with time zone,
	"signed_qr_base64" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_json" jsonb,
	"response_json" jsonb,
	"error_msg" text,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "e_way_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" text DEFAULT 'po' NOT NULL,
	"source_id" uuid NOT NULL,
	"e_invoice_id" uuid,
	"ewb_no" text,
	"transporter_id" text,
	"transporter_name" text,
	"trans_mode" text,
	"vehicle_no" text,
	"distance_km" integer DEFAULT 0 NOT NULL,
	"valid_upto" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_json" jsonb,
	"response_json" jsonb,
	"error_msg" text,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gst_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"summary_json" jsonb,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gstin_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gstin" text NOT NULL,
	"legal_name" text,
	"trade_name" text,
	"status" text,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"item_id" uuid,
	"item_name" text NOT NULL,
	"description" text,
	"quantity_scaled" integer NOT NULL,
	"uom" text DEFAULT 'nos' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfq_response_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"rfq_item_id" uuid NOT NULL,
	"unit_price_paise" text DEFAULT '0' NOT NULL,
	"delivery_days" integer,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfq_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone,
	"total_paise" text DEFAULT '0' NOT NULL,
	"remarks" text,
	"via_portal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfq_vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rfq_number" text,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" timestamp,
	"created_by_user_id" uuid NOT NULL,
	"awarded_vendor_id" uuid,
	"awarded_po_id" uuid,
	"awarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_portal_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"token" text NOT NULL,
	"scope" text DEFAULT 'full' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_portal_access_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_whatsapp_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'meta_cloud' NOT NULL,
	"phone_number_id" text,
	"api_token_cipher" text,
	"from_number" text,
	"app_secret_cipher" text,
	"verify_token" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_ok" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_whatsapp_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_unique" UNIQUE("tenant_id","user_id","channel")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"legal_name" text,
	"gstin" text,
	"pan" text,
	"contact_person" text,
	"email" text,
	"phone" text,
	"billing_address" text,
	"shipping_address" text,
	"city" text,
	"state" text,
	"pincode" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"credit_days" integer DEFAULT 0 NOT NULL,
	"credit_limit_paise" text,
	"payment_terms" text,
	"bank_account" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"so_id" uuid NOT NULL,
	"item_id" uuid,
	"item_name" text NOT NULL,
	"description" text,
	"item_group_name" text,
	"item_sub_group_name" text,
	"hsn_code" text,
	"quantity_scaled" integer NOT NULL,
	"uom" text DEFAULT 'nos' NOT NULL,
	"unit_price_paise" text NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"discount_amount_paise" text DEFAULT '0' NOT NULL,
	"tax_rate" integer DEFAULT 18 NOT NULL,
	"cgst_rate" integer DEFAULT 0 NOT NULL,
	"sgst_rate" integer DEFAULT 0 NOT NULL,
	"igst_rate" integer DEFAULT 0 NOT NULL,
	"subtotal_paise" text NOT NULL,
	"taxable_amount_paise" text DEFAULT '0' NOT NULL,
	"tax_paise" text NOT NULL,
	"cgst_paise" text DEFAULT '0' NOT NULL,
	"sgst_paise" text DEFAULT '0' NOT NULL,
	"igst_paise" text DEFAULT '0' NOT NULL,
	"total_paise" text NOT NULL,
	"fulfilled_qty_scaled" integer DEFAULT 0 NOT NULL,
	"committed_delivery_date" timestamp,
	"item_narration" text,
	"notes" text,
	"specifications" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"so_number" text,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"customer_po_number" text,
	"is_interstate" boolean DEFAULT false NOT NULL,
	"place_of_supply" text,
	"subtotal_paise" text DEFAULT '0' NOT NULL,
	"discount_total_paise" text DEFAULT '0' NOT NULL,
	"taxable_amount_paise" text DEFAULT '0' NOT NULL,
	"cgst_total_paise" text DEFAULT '0' NOT NULL,
	"sgst_total_paise" text DEFAULT '0' NOT NULL,
	"igst_total_paise" text DEFAULT '0' NOT NULL,
	"tax_total_paise" text DEFAULT '0' NOT NULL,
	"freight_charges_paise" text DEFAULT '0' NOT NULL,
	"other_charges_paise" text DEFAULT '0' NOT NULL,
	"round_off_paise" text DEFAULT '0' NOT NULL,
	"total_paise" text DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"expected_ship_date" timestamp,
	"valid_until" timestamp,
	"shipping_address" text,
	"billing_address" text,
	"delivery_terms" text,
	"payment_terms" text,
	"terms_and_conditions" text,
	"notes" text,
	"approval_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"so_item_id" uuid,
	"item_id" uuid,
	"item_name" text NOT NULL,
	"description" text,
	"hsn_code" text,
	"uom" text DEFAULT 'nos' NOT NULL,
	"qty_scaled" integer DEFAULT 0 NOT NULL,
	"unit_price_paise" text DEFAULT '0' NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"discount_amount_paise" text DEFAULT '0' NOT NULL,
	"tax_rate" integer DEFAULT 18 NOT NULL,
	"cgst_rate" integer DEFAULT 0 NOT NULL,
	"sgst_rate" integer DEFAULT 0 NOT NULL,
	"igst_rate" integer DEFAULT 0 NOT NULL,
	"subtotal_paise" text DEFAULT '0' NOT NULL,
	"taxable_amount_paise" text DEFAULT '0' NOT NULL,
	"cgst_paise" text DEFAULT '0' NOT NULL,
	"sgst_paise" text DEFAULT '0' NOT NULL,
	"igst_paise" text DEFAULT '0' NOT NULL,
	"tax_paise" text DEFAULT '0' NOT NULL,
	"total_paise" text DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"so_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"invoice_number" text,
	"invoice_date" timestamp NOT NULL,
	"due_date" timestamp,
	"is_interstate" boolean DEFAULT false NOT NULL,
	"place_of_supply" text,
	"subtotal_paise" text DEFAULT '0' NOT NULL,
	"discount_total_paise" text DEFAULT '0' NOT NULL,
	"taxable_amount_paise" text DEFAULT '0' NOT NULL,
	"cgst_total_paise" text DEFAULT '0' NOT NULL,
	"sgst_total_paise" text DEFAULT '0' NOT NULL,
	"igst_total_paise" text DEFAULT '0' NOT NULL,
	"tax_paise" text DEFAULT '0' NOT NULL,
	"round_off_paise" text DEFAULT '0' NOT NULL,
	"total_paise" text DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"amount_paid_paise" text DEFAULT '0' NOT NULL,
	"remarks" text,
	"issued_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_receipt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"sales_invoice_id" uuid,
	"so_id" uuid,
	"allocated_paise" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid,
	"unit_id" uuid,
	"customer_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"receipt_number" text,
	"receipt_date" timestamp NOT NULL,
	"method" text NOT NULL,
	"amount_paise" text DEFAULT '0' NOT NULL,
	"allocated_paise" text DEFAULT '0' NOT NULL,
	"reference" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"remarks" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"po_count" integer DEFAULT 0 NOT NULL,
	"grn_count" integer DEFAULT 0 NOT NULL,
	"total_ordered_paise" text DEFAULT '0' NOT NULL,
	"on_time_pct" integer,
	"quality_pct" integer,
	"price_index" integer,
	"responsiveness_pct" integer,
	"avg_lead_time_days" integer,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"grade" text DEFAULT 'C' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "anomaly_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demand_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_name" text NOT NULL,
	"uom" text DEFAULT 'nos' NOT NULL,
	"method" text DEFAULT 'moving_average' NOT NULL,
	"history_months" integer DEFAULT 0 NOT NULL,
	"avg_monthly_consumption_scaled" integer DEFAULT 0 NOT NULL,
	"forecast_next_month_scaled" integer DEFAULT 0 NOT NULL,
	"trend_pct_scaled" integer,
	"on_hand_scaled" integer DEFAULT 0 NOT NULL,
	"suggested_reorder_qty_scaled" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_gst_settings" ADD CONSTRAINT "tenant_gst_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_invoices" ADD CONSTRAINT "e_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_invoices" ADD CONSTRAINT "e_invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_way_bills" ADD CONSTRAINT "e_way_bills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_way_bills" ADD CONSTRAINT "e_way_bills_e_invoice_id_e_invoices_id_fk" FOREIGN KEY ("e_invoice_id") REFERENCES "public"."e_invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_way_bills" ADD CONSTRAINT "e_way_bills_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gst_returns" ADD CONSTRAINT "gst_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gst_returns" ADD CONSTRAINT "gst_returns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstin_verifications" ADD CONSTRAINT "gstin_verifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_response_items" ADD CONSTRAINT "rfq_response_items_response_id_rfq_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."rfq_responses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_response_items" ADD CONSTRAINT "rfq_response_items_rfq_item_id_rfq_items_id_fk" FOREIGN KEY ("rfq_item_id") REFERENCES "public"."rfq_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_responses" ADD CONSTRAINT "rfq_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_responses" ADD CONSTRAINT "rfq_responses_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_responses" ADD CONSTRAINT "rfq_responses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_vendors" ADD CONSTRAINT "rfq_vendors_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfq_vendors" ADD CONSTRAINT "rfq_vendors_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_awarded_vendor_id_vendors_id_fk" FOREIGN KEY ("awarded_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_awarded_po_id_purchase_orders_id_fk" FOREIGN KEY ("awarded_po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_portal_access" ADD CONSTRAINT "vendor_portal_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_portal_access" ADD CONSTRAINT "vendor_portal_access_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_whatsapp_settings" ADD CONSTRAINT "tenant_whatsapp_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_so_id_sales_orders_id_fk" FOREIGN KEY ("so_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_so_item_id_sales_order_items_id_fk" FOREIGN KEY ("so_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_so_id_sales_orders_id_fk" FOREIGN KEY ("so_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipt_allocations" ADD CONSTRAINT "sales_receipt_allocations_receipt_id_sales_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."sales_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipt_allocations" ADD CONSTRAINT "sales_receipt_allocations_sales_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("sales_invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipt_allocations" ADD CONSTRAINT "sales_receipt_allocations_so_id_sales_orders_id_fk" FOREIGN KEY ("so_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_scorecards" ADD CONSTRAINT "vendor_scorecards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_scorecards" ADD CONSTRAINT "vendor_scorecards_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_gst_settings_tenant_idx" ON "tenant_gst_settings" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_invoices_tenant_idx" ON "e_invoices" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_invoices_tenant_status_idx" ON "e_invoices" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_invoices_source_idx" ON "e_invoices" ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_invoices_irn_idx" ON "e_invoices" ("irn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_way_bills_tenant_idx" ON "e_way_bills" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_way_bills_tenant_status_idx" ON "e_way_bills" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_way_bills_source_idx" ON "e_way_bills" ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_way_bills_ewb_no_idx" ON "e_way_bills" ("ewb_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gst_returns_tenant_idx" ON "gst_returns" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gst_returns_period_idx" ON "gst_returns" ("tenant_id","period","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstin_verifications_tenant_idx" ON "gstin_verifications" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstin_verifications_tenant_gstin_idx" ON "gstin_verifications" ("tenant_id","gstin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfq_items_rfq_idx" ON "rfq_items" ("rfq_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfq_response_items_response_idx" ON "rfq_response_items" ("response_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfq_response_items_rfq_item_idx" ON "rfq_response_items" ("rfq_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfq_responses_rfq_idx" ON "rfq_responses" ("rfq_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfq_responses_vendor_idx" ON "rfq_responses" ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rfq_responses_uniq_idx" ON "rfq_responses" ("rfq_id","vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfq_vendors_rfq_idx" ON "rfq_vendors" ("rfq_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rfq_vendors_uniq_idx" ON "rfq_vendors" ("rfq_id","vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfqs_tenant_idx" ON "rfqs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfqs_tenant_status_idx" ON "rfqs" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfqs_number_idx" ON "rfqs" ("tenant_id","rfq_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_portal_access_token_idx" ON "vendor_portal_access" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_portal_access_tenant_idx" ON "vendor_portal_access" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_portal_access_vendor_idx" ON "vendor_portal_access" ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_whatsapp_settings_tenant_idx" ON "tenant_whatsapp_settings" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_whatsapp_settings_phone_idx" ON "tenant_whatsapp_settings" ("phone_number_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_prefs_user_idx" ON "notification_preferences" ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_tenant_idx" ON "customers" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_tenant_name_idx" ON "customers" ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_gstin_idx" ON "customers" ("gstin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_so_idx" ON "sales_order_items" ("so_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_tenant_idx" ON "sales_orders" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_tenant_status_idx" ON "sales_orders" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_customer_idx" ON "sales_orders" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_number_idx" ON "sales_orders" ("tenant_id","so_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_created_at_idx" ON "sales_orders" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoice_items_invoice_idx" ON "sales_invoice_items" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoice_items_so_item_idx" ON "sales_invoice_items" ("so_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_tenant_idx" ON "sales_invoices" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_tenant_status_idx" ON "sales_invoices" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_customer_idx" ON "sales_invoices" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_so_idx" ON "sales_invoices" ("so_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_number_idx" ON "sales_invoices" ("tenant_id","invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipt_allocations_receipt_idx" ON "sales_receipt_allocations" ("receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipt_allocations_invoice_idx" ON "sales_receipt_allocations" ("sales_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipt_allocations_so_idx" ON "sales_receipt_allocations" ("so_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipts_tenant_idx" ON "sales_receipts" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipts_tenant_status_idx" ON "sales_receipts" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipts_customer_idx" ON "sales_receipts" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipts_number_idx" ON "sales_receipts" ("tenant_id","receipt_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_scorecards_tenant_idx" ON "vendor_scorecards" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_scorecards_vendor_idx" ON "vendor_scorecards" ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anomaly_flags_tenant_idx" ON "anomaly_flags" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anomaly_flags_tenant_status_idx" ON "anomaly_flags" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anomaly_flags_fingerprint_idx" ON "anomaly_flags" ("tenant_id","fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demand_forecasts_tenant_idx" ON "demand_forecasts" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demand_forecasts_item_idx" ON "demand_forecasts" ("tenant_id","item_id");