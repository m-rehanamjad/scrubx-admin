import { z } from "zod";

export const discountTypeEnumSchema = z
  .enum(["percentage", "fixed_amount", "fixed"])
  .transform((val) => (val === "fixed" ? "fixed_amount" : val) as "percentage" | "fixed_amount");
export const couponStatusFilterEnumSchema = z.enum(["all", "active", "scheduled", "inactive", "expired"]);

export const couponFilterSchema = z.object({
  q: z.string().optional(),
  status: couponStatusFilterEnumSchema.default("all"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["code", "discountValue", "createdAt", "expiresAt", "usageCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Coupon code must be at least 2 characters")
      .max(50, "Coupon code cannot exceed 50 characters")
      .transform((val) => val.toUpperCase()),
    description: z.string().max(255).optional().nullable(),
    discountType: discountTypeEnumSchema,
    discountValue: z.number().positive("Discount value must be greater than 0"),
    minimumOrderAmount: z.number().min(0, "Minimum order amount cannot be negative").default(0),
    maximumDiscountAmount: z.number().positive("Maximum discount must be positive").optional().nullable(),
    usageLimit: z.number().int().positive("Usage limit must be a positive integer").optional().nullable(),
    usageLimitPerCustomer: z.number().int().positive("Per-customer limit must be a positive integer").optional().nullable(),
    firstOrderOnly: z.boolean().default(false),
    startsAt: z.coerce.date().default(() => new Date()),
    expiresAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => data.discountType !== "percentage" || data.discountValue <= 100,
    { message: "Percentage discount cannot exceed 100%", path: ["discountValue"] }
  )
  .refine(
    (data) => !data.expiresAt || data.expiresAt > data.startsAt,
    { message: "Expiration date must be after start date", path: ["expiresAt"] }
  );

export const updateCouponSchema = z.object({
  id: z.string().uuid("Invalid coupon ID"),
  code: z
    .string()
    .trim()
    .min(2, "Coupon code must be at least 2 characters")
    .max(50, "Coupon code cannot exceed 50 characters")
    .transform((val) => val.toUpperCase())
    .optional(),
  description: z.string().max(255).optional().nullable(),
  discountType: discountTypeEnumSchema.optional(),
  discountValue: z.number().positive("Discount value must be greater than 0").optional(),
  minimumOrderAmount: z.number().min(0, "Minimum order amount cannot be negative").optional(),
  maximumDiscountAmount: z.number().positive("Maximum discount must be positive").optional().nullable(),
  usageLimit: z.number().int().positive("Usage limit must be a positive integer").optional().nullable(),
  usageLimitPerCustomer: z.number().int().positive("Per-customer limit must be a positive integer").optional().nullable(),
  firstOrderOnly: z.boolean().optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const toggleCouponStatusSchema = z.object({
  id: z.string().uuid("Invalid coupon ID"),
  isActive: z.boolean(),
});

export const deleteCouponSchema = z.object({
  id: z.string().uuid("Invalid coupon ID"),
});

export const couponUsageFilterSchema = z.object({
  couponId: z.string().uuid("Invalid coupon ID"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type DiscountType = z.infer<typeof discountTypeEnumSchema>;
export type CouponStatusFilter = z.infer<typeof couponStatusFilterEnumSchema>;
export type CouponFilter = z.infer<typeof couponFilterSchema>;
export type CreateCouponInput = z.input<typeof createCouponSchema>;
export type CreateCouponOutput = z.output<typeof createCouponSchema>;
export type UpdateCouponInput = z.input<typeof updateCouponSchema>;
export type UpdateCouponOutput = z.output<typeof updateCouponSchema>;
export type CouponUsageFilter = z.infer<typeof couponUsageFilterSchema>;
