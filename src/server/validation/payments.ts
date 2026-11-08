import { z } from "zod";
import { uuidSchema } from "./common.ts";

/**
 * Payment Statuses in PostgreSQL Enum
 */
export const paymentStatusEnumSchema = z.enum([
  "pending",
  "awaiting_verification",
  "paid",
  "rejected",
  "failed",
  "refunded",
]);

export type PaymentStatus = z.infer<typeof paymentStatusEnumSchema>;

/**
 * Payment Listing Filter Schema
 */
export const paymentFilterSchema = z.object({
  orderId: uuidSchema.optional(),
  status: paymentStatusEnumSchema.optional(),
  paymentMethodId: uuidSchema.optional(),
  q: z.string().trim().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "amount", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaymentFilterInput = z.infer<typeof paymentFilterSchema>;

/**
 * Customer / Admin Submit Payment Proof Schema
 */
export const submitPaymentProofSchema = z.object({
  paymentId: uuidSchema,
  senderName: z.string().trim().max(100).optional().nullable(),
  senderAccountLast4: z.string().trim().max(10).optional().nullable(),
  transactionReference: z.string().trim().max(100).optional().nullable(),
  proofUrl: z.string().trim().optional().nullable(),
  imagekitFileId: z.string().trim().optional().nullable(),
  customerNotes: z.string().trim().max(500).optional().nullable(),
});

export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;

/**
 * Admin Verify Payment (Approve or Reject) Schema
 */
export const verifyPaymentSchema = z
  .object({
    paymentId: uuidSchema,
    action: z.enum(["approve", "reject"]),
    rejectionReason: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.action === "reject") {
        return Boolean(data.rejectionReason && data.rejectionReason.trim().length > 0);
      }
      return true;
    },
    {
      message: "A rejection reason must be provided when rejecting payment.",
      path: ["rejectionReason"],
    }
  );

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

/**
 * Process Payment Refund Schema
 */
export const refundPaymentSchema = z.object({
  paymentId: uuidSchema,
  reason: z.string().trim().min(3, "Refund reason is required.").max(500),
});

export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
