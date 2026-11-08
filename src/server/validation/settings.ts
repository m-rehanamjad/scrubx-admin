import { z } from "zod";
import {
  storeSettingKeySchema,
  storeSettingsValueSchemas,
} from "../../db/schema/json-schemas.ts";
import type { StoreSettingKey, StoreSettingsMap } from "../../db/schema/json-types.ts";

export { storeSettingKeySchema };
export type { StoreSettingKey, StoreSettingsMap };

/**
 * Validation schema for updating a single store setting.
 * Dynamically validates the value based on the specified setting key.
 */
export const updateStoreSettingSchema = z
  .object({
    key: storeSettingKeySchema,
    value: z.unknown(),
  })
  .superRefine((data, ctx) => {
    const validator = storeSettingsValueSchemas[data.key as keyof typeof storeSettingsValueSchemas];
    if (!validator) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `No validation rule registered for setting key '${data.key}'.`,
        path: ["key"],
      });
      return;
    }

    const result = validator.safeParse(data.value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ["value", ...issue.path],
        });
      }
    }
  });

export type UpdateStoreSettingInput = z.infer<typeof updateStoreSettingSchema>;

/**
 * Validation schema for retrieving a single store setting.
 */
export const getStoreSettingSchema = z.object({
  key: storeSettingKeySchema,
});

export type GetStoreSettingInput = z.infer<typeof getStoreSettingSchema>;

/**
 * Validation schema for batch updating store settings.
 * Validates partial settings payload matching the admin Settings form.
 */
export const batchUpdateStoreSettingsSchema = z.object({
  store_name: z.string().trim().min(2, "Store name must be at least 2 characters").optional(),
  tagline: z.string().optional(),
  support_email: z.string().email("Enter a valid support email").optional(),
  support_phone: z.string().trim().min(7, "Enter a valid support phone number").optional(),
  whatsapp_number: z.string().trim().min(7, "Enter a valid WhatsApp number").optional(),
  address: z.string().trim().min(5, "Enter store address").optional(),
  city: z.string().trim().min(2, "City is required").optional(),
  province: z.string().trim().min(2, "Province is required").optional(),
  postal_code: z.string().trim().min(3, "Postal code is required").optional(),
  currency: z.string().trim().min(1, "Currency is required").default("PKR").optional(),
  payment_deadline_hours: z.number().int().min(1, "Minimum 1 hour").max(168, "Maximum 168 hours").optional(),
  default_shipping_method_id: z.string().uuid("Invalid shipping method ID").optional(),
  order_confirmation_auto: z.boolean().optional(),
  low_stock_alerts: z.boolean().optional(),
  new_order_email: z.boolean().optional(),
  new_order_whatsapp: z.boolean().optional(),
  payment_submitted_alert: z.boolean().optional(),
  daily_summary: z.boolean().optional(),
});

export type BatchUpdateStoreSettingsInput = z.infer<typeof batchUpdateStoreSettingsSchema>;
