import { z } from "zod";

/**
 * Zod validation schemas matching JSONB TypeScript interfaces.
 * Provides runtime validation since Drizzle's .$type<T>() is compile-time only.
 */

export const variantAttributesSchema = z.object({
  manual: z.boolean().optional(),
});

export const shippingAddressSnapshotSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone number is required"),
  addressLine1: z.string().min(1, "Address line 1 is required"),
  addressLine2: z.string().nullable().optional(),
  city: z.string().min(1, "City is required"),
  province: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  country: z.string().default("PK"),
});

export const paymentRejectionRecordSchema = z.object({
  rejectedBy: z.string().min(1),
  rejectedAt: z.string().min(1),
  reason: z.string().min(1),
});

export const paymentMetadataSchema = z.object({
  customerNotes: z.string().optional(),
  imagekitFileId: z.string().optional(),
  proofUploadedAt: z.string().optional(),
  rejectionHistory: z.array(paymentRejectionRecordSchema).optional(),
});

export const storeSettingKeySchema = z.enum([
  "whatsapp_number",
  "payment_deadline_hours",
  "store_name",
  "tagline",
  "support_email",
  "support_phone",
  "address",
  "city",
  "province",
  "postal_code",
  "currency",
  "default_shipping_method_id",
  "order_confirmation_auto",
  "low_stock_alerts",
  "new_order_email",
  "new_order_whatsapp",
  "payment_submitted_alert",
  "daily_summary",
]);

export const storeSettingsValueSchemas = {
  whatsapp_number: z.string().min(1),
  payment_deadline_hours: z.number().int().positive(),
  store_name: z.string().min(1),
  tagline: z.string(),
  support_email: z.string().email(),
  support_phone: z.string(),
  address: z.string(),
  city: z.string(),
  province: z.string(),
  postal_code: z.string(),
  currency: z.string().min(1),
  default_shipping_method_id: z.string(),
  order_confirmation_auto: z.boolean(),
  low_stock_alerts: z.boolean(),
  new_order_email: z.boolean(),
  new_order_whatsapp: z.boolean(),
  payment_submitted_alert: z.boolean(),
  daily_summary: z.boolean(),
} as const;
