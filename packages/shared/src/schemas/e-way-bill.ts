import { z } from "zod";

/**
 * E-Way Bill contracts shared FE↔BE. Generated for goods movement, optionally
 * off an existing e-invoice (the IRN can pre-populate the EWB). Validity is
 * derived server-side from the distance.
 */

export const eWayBillStatusSchema = z.enum(["pending", "generated", "cancelled", "failed"]);
export type EWayBillStatus = z.infer<typeof eWayBillStatusSchema>;

export const transModeSchema = z.enum(["road", "rail", "air", "ship"]);
export type TransMode = z.infer<typeof transModeSchema>;

export const eWayBillGenerateSchema = z.object({
  sourceType: z.enum(["po", "sales_invoice"]).default("po"),
  sourceId: z.string().uuid("A valid source document id is required"),
  /** Optionally tie to an already-generated e-invoice. */
  eInvoiceId: z.string().uuid().optional().nullable(),
  transporterId: z.string().trim().max(20).optional().nullable(),
  transporterName: z.string().trim().max(120).optional().nullable(),
  transMode: transModeSchema.default("road"),
  vehicleNo: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, "Enter the vehicle number")
    .max(20),
  distanceKm: z.coerce.number().int().min(0).max(4000).default(0),
});
export type EWayBillGenerateInput = z.infer<typeof eWayBillGenerateSchema>;

/** Cancel an EWB. Reason codes: 1 = Duplicate, 2 = Order cancelled, 3 = Data entry mistake, 4 = Others. */
export const eWayBillCancelSchema = z.object({
  reason: z.enum(["1", "2", "3", "4"]).default("3"),
  remark: z.string().trim().min(1, "A cancellation remark is required").max(100),
});
export type EWayBillCancelInput = z.infer<typeof eWayBillCancelSchema>;

export const eWayBillListItemSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["po", "sales_invoice"]),
  sourceId: z.string(),
  eInvoiceId: z.string().nullable(),
  ewbNo: z.string().nullable(),
  transporterName: z.string().nullable(),
  transMode: z.string().nullable(),
  vehicleNo: z.string().nullable(),
  distanceKm: z.number(),
  validUpto: z.string().nullable(),
  status: eWayBillStatusSchema,
  errorMsg: z.string().nullable(),
  createdAt: z.string(),
});
export type EWayBillListItem = z.infer<typeof eWayBillListItemSchema>;

export const eWayBillViewSchema = eWayBillListItemSchema.extend({
  transporterId: z.string().nullable(),
  requestJson: z.record(z.unknown()).nullable(),
  responseJson: z.record(z.unknown()).nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type EWayBillView = z.infer<typeof eWayBillViewSchema>;
