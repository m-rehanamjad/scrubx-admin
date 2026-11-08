"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { paymentMethodService } from "../server/services/payment-method.service.ts";
import {
  updatePaymentMethodSchema,
  togglePaymentMethodStatusSchema,
  reorderPaymentMethodsSchema,
} from "../server/validation/payment-methods.ts";

/**
 * Server Action: Update an existing payment method configuration.
 * Strictly enforces admin role authorization and the COD engraving restriction invariant.
 */
export const updatePaymentMethodAction = createSafeAction(
  {
    schema: updatePaymentMethodSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await paymentMethodService.updatePaymentMethod(input, admin);
    revalidatePath("/payment-methods");
    return updated;
  }
);

/**
 * Server Action: Toggle active status of a payment method.
 * Strictly enforces admin role authorization.
 */
export const togglePaymentMethodStatusAction = createSafeAction(
  {
    schema: togglePaymentMethodStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await paymentMethodService.togglePaymentMethodStatus(input.id, input.isActive, admin);
    revalidatePath("/payment-methods");
    return updated;
  }
);

/**
 * Server Action: Atomically reorder payment methods.
 * Strictly enforces admin role authorization.
 */
export const reorderPaymentMethodsAction = createSafeAction(
  {
    schema: reorderPaymentMethodsSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    await paymentMethodService.reorderPaymentMethods(input.items, admin);
    revalidatePath("/payment-methods");
    return { success: true };
  }
);
