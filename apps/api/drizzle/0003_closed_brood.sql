ALTER TABLE "po_items" ADD COLUMN "line_buyer_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "po_items" ADD CONSTRAINT "po_items_line_buyer_user_id_users_id_fk" FOREIGN KEY ("line_buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
