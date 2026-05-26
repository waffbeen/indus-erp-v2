import { z } from "zod";

export const poStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "sent_to_vendor",
  "partially_received",
  "received",
  "closed",
  "cancelled",
]);
export type PoStatus = z.infer<typeof poStatusSchema>;

export const poItemInputSchema = z.object({
  prItemId: z.string().uuid().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
  itemName: z.string().trim().min(1, "Item name is required").max(200, "Item name is too long"),
  description: z.string().max(500).optional().nullable(),
  itemGroupName: z.string().max(80).optional().nullable(),
  itemSubGroupName: z.string().max(80).optional().nullable(),
  hsnCode: z.string().max(20).optional().nullable(),
  quantity: z.number({ invalid_type_error: "Quantity must be a number" }).positive("Quantity must be greater than 0"),
  uom: z.string().trim().min(1, "UOM is required").max(20),
  unitPrice: z.number({ invalid_type_error: "Unit price must be a number" }).positive("Unit price must be greater than 0"),
  discountPercent: z.number().min(0).max(100, "Discount cannot exceed 100%").default(0),
  taxRate: z.number().min(0, "Tax cannot be negative").max(100, "Tax cannot exceed 100%").default(18),
  committedDeliveryDate: z.string().date().optional().nullable(),
  itemNarration: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  specifications: z.record(z.unknown()).optional().nullable(),
  /** Per-line buyer (the procurement user executing this line). */
  lineBuyerUserId: z.string().uuid().optional().nullable(),
  /** Receipt tolerance ±% — vendor can over/under-deliver within this band. */
  tolerancePercent: z.number().min(0).max(50).default(0),
  /** Vendor warranty in months (0 = no warranty). */
  warrantyMonths: z.number().int().min(0).max(120).default(0),
  /** Forecast/safety stock purchase. */
  isForStock: z.boolean().default(false),
  /** Item is being recovered/exchanged — costing rules differ. */
  isRecoveryRate: z.boolean().default(false),
  /**
   * Split-delivery plan. If empty, the whole quantity uses committedDeliveryDate.
   * Each entry's qty is in human units (matches the line's `quantity`).
   */
  deliverySchedule: z.array(
    z.object({
      qty: z.number().positive("Schedule qty must be > 0"),
      deliveryDate: z.string().date("Pick a delivery date"),
    }),
  ).default([]),
});
export type PoItemInput = z.infer<typeof poItemInputSchema>;

export const poTypeSchema = z.enum(["capex", "opex", "amc", "service", "trading", "import", "other"]);
export type PoType = z.infer<typeof poTypeSchema>;

export const forDeliverySchema = z.enum(["ex_works", "for_plant", "cif", "annexure", "upto_destination"]);
export type ForDelivery = z.infer<typeof forDeliverySchema>;

export const poCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit"),
  vendorId: z.string().uuid("Please select a vendor"),
  prId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200, "Title is too long (max 200)"),
  description: z.string().max(2000, "Description is too long").optional().nullable(),
  /** Interstate vs intrastate — drives IGST vs CGST+SGST split. */
  isInterstate: z.boolean().default(false),
  placeOfSupply: z.string().max(20).optional().nullable(),
  deliveryDate: z.string().date().optional().nullable(),
  validUntil: z.string().date().optional().nullable(),
  deliveryAddress: z.string().max(500).optional().nullable(),
  deliveryTerms: z.string().max(200).optional().nullable(),
  paymentTerms: z.string().max(200).optional().nullable(),
  termsAndConditions: z.string().max(2000).optional().nullable(),
  /** Header-level charges (in ₹, will be stored as paise). */
  freightCharges: z.number().nonnegative().default(0),
  otherCharges: z.number().nonnegative().default(0),
  roundOff: z.number().default(0),
  /** PO revision (0 for new, 1+ for revision). */
  revisionNo: z.number().int().nonnegative().default(0),
  revisionRemark: z.string().max(500).optional().nullable(),
  /** Legacy parity — PO type / F.O.R. / credit period / printable clauses. */
  poType: poTypeSchema.optional().nullable(),
  forDelivery: forDeliverySchema.optional().nullable(),
  creditPeriodDays: z.number().int().nonnegative().max(720, "Credit period feels unrealistic").optional().nullable(),
  insuranceTerms: z.string().max(500).optional().nullable(),
  penaltyTerms: z.string().max(500).optional().nullable(),
  packingTerms: z.string().max(500).optional().nullable(),
  /**
   * Itemised header-level charges (e.g. "Freight: 5000", "Insurance: 2500").
   * Sum is added to the grand total on top of taxable + GST + roundOff.
   * Replaces the single freightCharges/otherCharges values for richer breakup.
   */
  additionalCharges: z.array(
    z.object({
      label: z.string().trim().min(1, "Label is required").max(60),
      amount: z.number().nonnegative(),
    }),
  ).default([]),
  items: z.array(poItemInputSchema).min(1, "Add at least one line item"),
});
export type PoCreateInput = z.infer<typeof poCreateSchema>;

export const poAmendInputSchema = z.object({
  summary: z.string().trim().min(3, "Summary is required").max(120, "Keep it short — max 120 chars"),
  remark: z.string().max(1000).optional().nullable(),
});
export type PoAmendInput = z.infer<typeof poAmendInputSchema>;

export const poUpdateSchema = poCreateSchema.partial();
export type PoUpdateInput = z.infer<typeof poUpdateSchema>;

export const poApprovalActionSchema = z.object({
  poId: z.string().uuid(),
  action: z.enum(["approve", "reject", "request_changes"]),
  comment: z.string().max(1000).optional().nullable(),
});
export type PoApprovalActionInput = z.infer<typeof poApprovalActionSchema>;

/* ----- Read shapes ----- */
export const poListItemSchema = z.object({
  id: z.string().uuid(),
  poNumber: z.string(),
  title: z.string(),
  status: poStatusSchema,
  vendorId: z.string().uuid(),
  vendorName: z.string(),
  prId: z.string().uuid().nullable(),
  total: z.number().nonnegative(),
  currency: z.string().default("INR"),
  itemsCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  deliveryDate: z.string().date().nullable(),
});
export type PoListItem = z.infer<typeof poListItemSchema>;
