import { z } from "zod";

export const idSchema = z.string().uuid();
export type Id = z.infer<typeof idSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const moneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default("INR"),
});
export type Money = z.infer<typeof moneySchema>;

/** A generic response envelope used by the API. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
