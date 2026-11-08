"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { settingsService } from "../server/services/settings.service.ts";
import {
  updateStoreSettingSchema,
  getStoreSettingSchema,
  batchUpdateStoreSettingsSchema,
} from "../server/validation/settings.ts";

/**
 * Server Action: Retrieve all store settings.
 * Enforces staff role authorization.
 */
export const getStoreSettingsAction = createSafeAction(
  {
    requiredRole: "staff",
  },
  async ({ admin }) => {
    return settingsService.getAllSettings(admin);
  }
);

/**
 * Server Action: Retrieve a single store setting by key.
 * Validates key using getStoreSettingSchema, enforces staff role.
 */
export const getStoreSettingByKeyAction = createSafeAction(
  {
    schema: getStoreSettingSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return settingsService.getSetting(input.key as any, admin);
  }
);

/**
 * Server Action: Update a store setting.
 * Validates payload with updateStoreSettingSchema, enforces admin role,
 * and revalidates the /settings route cache.
 */
export const updateStoreSettingAction = createSafeAction(
  {
    schema: updateStoreSettingSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await settingsService.updateSetting(
      input.key as any,
      input.value as any,
      admin
    );

    revalidatePath("/settings");

    return updated;
  }
);

/**
 * Server Action: Batch update store settings from the admin settings form.
 * Strictly enforces admin role authorization, runs atomically in a transaction,
 * and revalidates the /settings route cache.
 */
export const updateStoreSettingsBatchAction = createSafeAction(
  {
    schema: batchUpdateStoreSettingsSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await settingsService.updateSettingsBatch(input as any, admin);
    revalidatePath("/settings");
    return updated;
  }
);

/**
 * Server Action: Live database connection health query.
 * Enforces staff role authorization.
 */
export const getDatabaseHealthAction = createSafeAction(
  {
    requiredRole: "staff",
  },
  async ({ admin }) => {
    return settingsService.getHealthStatus(admin);
  }
);
