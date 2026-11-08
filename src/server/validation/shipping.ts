import { z } from "zod";

export const createShippingMethodSchema = z
  .object({
    name: z.string().trim().min(2, "Shipping method name must be at least 2 characters").max(100),
    description: z.string().max(255).optional().nullable(),
    price: z.number().min(0, "Price cannot be negative").default(0),
    freeAbove: z.number().min(0, "Free threshold cannot be negative").optional().nullable(),
    estimatedDays: z.number().int().min(0).optional().nullable(),
    minDays: z.number().int().min(0).optional().nullable(),
    maxDays: z.number().int().min(0).optional().nullable(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .refine(
    (data) => data.minDays == null || data.maxDays == null || data.maxDays >= data.minDays,
    { message: "Maximum delivery days cannot be less than minimum delivery days", path: ["maxDays"] }
  );

export const updateShippingMethodSchema = z.object({
  id: z.string().uuid("Invalid shipping method ID"),
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().max(255).optional().nullable(),
  price: z.number().min(0).optional(),
  freeAbove: z.number().min(0).optional().nullable(),
  estimatedDays: z.number().int().min(0).optional().nullable(),
  minDays: z.number().int().min(0).optional().nullable(),
  maxDays: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const toggleShippingMethodStatusSchema = z.object({
  id: z.string().uuid("Invalid shipping method ID"),
  isActive: z.boolean(),
});

export const deleteShippingMethodSchema = z.object({
  id: z.string().uuid("Invalid shipping method ID"),
});

export const reorderShippingMethodsSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
    .min(1, "At least one item required to reorder"),
});

export const shippingMethodFilterSchema = z.object({
  isActive: z.boolean().optional(),
});

export type CreateShippingMethodInput = z.input<typeof createShippingMethodSchema>;
export type CreateShippingMethodOutput = z.output<typeof createShippingMethodSchema>;
export type UpdateShippingMethodInput = z.input<typeof updateShippingMethodSchema>;
export type UpdateShippingMethodOutput = z.output<typeof updateShippingMethodSchema>;
export type ReorderShippingMethodsInput = z.infer<typeof reorderShippingMethodsSchema>;
export type ShippingMethodFilter = z.infer<typeof shippingMethodFilterSchema>;
