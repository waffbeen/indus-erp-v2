import { z } from "zod";

export const STORAGE_LOCATION_TYPES = ["warehouse", "zone", "rack", "bin"] as const;
export type StorageLocationType = (typeof STORAGE_LOCATION_TYPES)[number];

export const locationUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  unitId: z.string().uuid("Please select a unit / warehouse"),
  code: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long (max 120)"),
  type: z.enum(STORAGE_LOCATION_TYPES).default("warehouse"),
  parentId: z.string().uuid().optional().nullable().or(z.literal("")),
  isActive: z.boolean().optional(),
});
export type LocationUpsertInput = z.infer<typeof locationUpsertSchema>;
