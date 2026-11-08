"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { engravingService } from "../server/services/engraving.service.ts";
import {
  createEngravingOptionSchema,
  updateEngravingOptionSchema,
  toggleEngravingOptionStatusSchema,
  deleteEngravingOptionSchema,
} from "../server/validation/engraving.ts";

/**
 * Server Action: Create a new personalization engraving option.
 * Strictly enforces admin role authorization.
 */
export const createEngravingOptionAction = createSafeAction(
  {
    schema: createEngravingOptionSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const created = await engravingService.createEngravingOption(input, admin);
    revalidatePath("/engraving");
    return created;
  }
);

/**
 * Server Action: Update an existing engraving option.
 * Strictly enforces admin role authorization and text character cap validation.
 */
export const updateEngravingOptionAction = createSafeAction(
  {
    schema: updateEngravingOptionSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await engravingService.updateEngravingOption(input, admin);
    revalidatePath("/engraving");
    return updated;
  }
);

/**
 * Server Action: Toggle active status of an engraving option.
 * Strictly enforces admin role authorization.
 */
export const toggleEngravingOptionStatusAction = createSafeAction(
  {
    schema: toggleEngravingOptionStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await engravingService.toggleEngravingOptionStatus(input.id, input.isActive, admin);
    revalidatePath("/engraving");
    return updated;
  }
);

/**
 * Server Action: Safely delete or deactivate an engraving option.
 * Safely deactivates if historical order item references exist.
 * Strictly enforces admin role authorization.
 */
export const deleteEngravingOptionAction = createSafeAction(
  {
    schema: deleteEngravingOptionSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await engravingService.deleteEngravingOption(input.id, admin);
    revalidatePath("/engraving");
    return result;
  }
);
