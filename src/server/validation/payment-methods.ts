import { z } from "zod";

export const paymentMethodTypeEnumSchema = z.enum(["wallet", "bank_transfer", "cod"]);

export const updatePaymentMethodSchema = z.object({
  id: z.string().uuid("Invalid payment method ID"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").optional(),
  accountTitle: z.string().trim().optional().nullable(),
  accountNumber: z.string().trim().optional().nullable(),
  bankName: z.string().trim().optional().nullable(),
  iban: z.string().trim().optional().nullable(),
  instructions: z.string().optional().nullable(),
  allowedWithEngraving: z.boolean().optional(),
  supportsProof: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const togglePaymentMethodStatusSchema = z.object({
  id: z.string().uuid("Invalid payment method ID"),
  isActive: z.boolean(),
});

export const reorderPaymentMethodsSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
    .min(1, "At least one item required to reorder"),
});

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;
export type ReorderPaymentMethodsInput = z.infer<typeof reorderPaymentMethodsSchema>;
