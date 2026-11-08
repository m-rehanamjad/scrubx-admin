"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { inventoryService } from "../server/services/inventory.service.ts";
import {
  inventoryFilterSchema,
  getVariantInventorySchema,
  getProductInventorySchema,
  adjustStockSchema,
  restockSchema,
  inventoryMovementFilterSchema,
} from "../server/validation/inventory.ts";

/**
 * Server Action: Filtered, paginated inventory query across catalog products and variants.
 * Requires at least staff privileges.
 */
export const getInventoryAction = createSafeAction(
  {
    schema: inventoryFilterSchema.optional(),
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return inventoryService.getInventory(input ?? {}, admin);
  }
);

/**
 * Server Action: Retrieve overall catalog inventory summary KPI statistics.
 * Requires at least staff privileges.
 */
export const getInventorySummaryAction = createSafeAction(
  {
    requiredRole: "staff",
  },
  async ({ admin }) => {
    return inventoryService.getInventorySummary(admin);
  }
);

/**
 * Server Action: Retrieve inventory details for a single variant.
 * Requires at least staff privileges.
 */
export const getVariantInventoryAction = createSafeAction(
  {
    schema: getVariantInventorySchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return inventoryService.getVariantInventory(input.variantId, admin);
  }
);

/**
 * Server Action: Retrieve all variant inventory records for a product.
 * Requires at least staff privileges.
 */
export const getProductInventoryAction = createSafeAction(
  {
    schema: getProductInventorySchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return inventoryService.getProductInventory(input.productId, admin);
  }
);

/**
 * Server Action: Perform manual stock adjustment using transactional row locking.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const adjustStockAction = createSafeAction(
  {
    schema: adjustStockSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await inventoryService.adjustStock(input, admin);
    revalidatePath("/inventory");
    revalidatePath("/products");
    return updated;
  }
);

/**
 * Server Action: Restock variant quantity using transactional row locking.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const restockAction = createSafeAction(
  {
    schema: restockSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await inventoryService.restock(input, admin);
    revalidatePath("/inventory");
    revalidatePath("/products");
    return updated;
  }
);

/**
 * Server Action: Retrieve paginated audit history of inventory movements.
 * Requires at least staff privileges.
 */
export const getInventoryMovementsAction = createSafeAction(
  {
    schema: inventoryMovementFilterSchema.optional(),
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return inventoryService.getMovements(input ?? {}, admin);
  }
);
