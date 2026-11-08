"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { shippingService } from "../server/services/shipping.service.ts";
import {
  createShippingMethodSchema,
  updateShippingMethodSchema,
  toggleShippingMethodStatusSchema,
  deleteShippingMethodSchema,
  reorderShippingMethodsSchema,
} from "../server/validation/shipping.ts";

/**
 * Server Action: Create a new shipping delivery method.
 * Strictly enforces admin role authorization.
 */
export const createShippingMethodAction = createSafeAction(
  {
    schema: createShippingMethodSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const created = await shippingService.createShippingMethod(input, admin);
    revalidatePath("/shipping");
    return created;
  }
);

/**
 * Server Action: Update an existing shipping delivery method.
 * Strictly enforces admin role authorization and delivery window validation.
 */
export const updateShippingMethodAction = createSafeAction(
  {
    schema: updateShippingMethodSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await shippingService.updateShippingMethod(input, admin);
    revalidatePath("/shipping");
    return updated;
  }
);

/**
 * Server Action: Toggle active status of a shipping delivery method.
 * Strictly enforces admin role authorization.
 */
export const toggleShippingMethodStatusAction = createSafeAction(
  {
    schema: toggleShippingMethodStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await shippingService.toggleShippingMethodStatus(input.id, input.isActive, admin);
    revalidatePath("/shipping");
    return updated;
  }
);

/**
 * Server Action: Safely delete or deactivate a shipping method.
 * Safely deactivates if historical order references exist.
 * Strictly enforces admin role authorization.
 */
export const deleteShippingMethodAction = createSafeAction(
  {
    schema: deleteShippingMethodSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await shippingService.deleteShippingMethod(input.id, admin);
    revalidatePath("/shipping");
    return result;
  }
);

/**
 * Server Action: Atomically reorder shipping methods.
 * Strictly enforces admin role authorization and duplicate ID rejection.
 */
export const reorderShippingMethodsAction = createSafeAction(
  {
    schema: reorderShippingMethodsSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    await shippingService.reorderShippingMethods(input.items, admin);
    revalidatePath("/shipping");
    return { success: true };
  }
);
