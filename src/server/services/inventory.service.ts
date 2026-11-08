import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { inventoryMovements } from "../../db/schema/index.ts";
import {
  inventoryRepository,
  InventoryRepository,
  type InventoryItem,
  type InventorySummaryMetrics,
  type InventoryMovementItem,
} from "../repositories/inventory.repository.ts";
import type { DatabaseExecutor } from "../repositories/base.repository.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { NotFoundError, ConflictError, ValidationError } from "../errors.ts";
import type {
  InventoryFilterInput,
  AdjustStockInput,
  RestockInput,
  InventoryMovementFilterInput,
} from "../validation/inventory.ts";
import type { PaginatedResult } from "../types.ts";

export class InventoryService {
  private readonly repo: InventoryRepository;

  constructor(repo: InventoryRepository = inventoryRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves filtered, paginated inventory rows across products and variants.
   * Requires at least staff privileges.
   */
  async getInventory(
    filter: Partial<InventoryFilterInput> = {},
    admin: AdminContext
  ): Promise<PaginatedResult<InventoryItem>> {
    assertRole(admin, ["staff"]);

    const normalizedFilter: InventoryFilterInput = {
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
      sortBy: filter.sortBy ?? "updatedAt",
      sortOrder: filter.sortOrder ?? "desc",
      status: filter.status ?? "all",
      ...filter,
    };

    return this.repo.findPaginated(normalizedFilter);
  }

  /**
   * Calculates overall catalog inventory KPI summary statistics.
   * Requires at least staff privileges.
   */
  async getInventorySummary(admin: AdminContext): Promise<InventorySummaryMetrics> {
    assertRole(admin, ["staff"]);
    return this.repo.getSummaryMetrics();
  }

  /**
   * Retrieves detailed inventory information for a specific variant.
   * Requires at least staff privileges.
   */
  async getVariantInventory(
    variantId: string,
    admin: AdminContext
  ): Promise<InventoryItem> {
    assertRole(admin, ["staff"]);

    const item = await this.repo.findByVariantId(variantId);
    if (!item) {
      throw new NotFoundError("Variant inventory", variantId);
    }

    return item;
  }

  /**
   * Retrieves all variant inventory records for a product.
   * Requires at least staff privileges.
   */
  async getProductInventory(
    productId: string,
    admin: AdminContext
  ): Promise<InventoryItem[]> {
    assertRole(admin, ["staff"]);
    return this.repo.findByProductId(productId);
  }

  /**
   * Executes a manual stock adjustment using transactional row-level locking (SELECT ... FOR UPDATE).
   * Enforces non-negative stock invariants and prevents reducing stock below reserved order quantities.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async adjustStock(
    input: AdjustStockInput,
    admin: AdminContext
  ): Promise<InventoryItem> {
    assertRole(admin, ["admin"]);

    await db.transaction(async (tx) => {
      // 1. Acquire exclusive row lock to prevent concurrent update races
      const current = await this.repo.findForUpdate(input.variantId, tx);
      if (!current) {
        throw new NotFoundError("Variant inventory", input.variantId);
      }

      // 2. Compute delta
      let change = 0;
      if (input.mode === "add") {
        change = input.quantity;
      } else if (input.mode === "remove") {
        change = -input.quantity;
      } else if (input.mode === "set") {
        change = input.quantity - current.quantityOnHand;
      }

      const nextOnHand = current.quantityOnHand + change;

      // 3. Invariant checks
      if (nextOnHand < 0) {
        throw new ValidationError("Quantity on hand cannot be negative.");
      }

      if (nextOnHand < current.quantityReserved) {
        throw new ValidationError(
          `Cannot reduce stock to ${nextOnHand}. Current reservations across open orders require at least ${current.quantityReserved} units.`
        );
      }

      // 4. Update row
      await this.repo.updateInventoryRow(
        current.id,
        {
          quantityOnHand: nextOnHand,
        },
        tx
      );

      // 5. Append movement audit log if quantity changed
      if (change !== 0) {
        await this.repo.insertMovement(
          {
            variantId: input.variantId,
            change,
            reason: input.reason ?? "adjustment",
            createdBy: admin.id,
          },
          tx
        );
      }
    });

    const updated = await this.repo.findByVariantId(input.variantId);
    return updated!;
  }

  /**
   * Restocks variant quantity using transactional locking and logs a 'restock' movement.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async restock(input: RestockInput, admin: AdminContext): Promise<InventoryItem> {
    return this.adjustStock(
      {
        variantId: input.variantId,
        mode: "add",
        quantity: input.quantity,
        reason: "restock",
        notes: input.notes,
      },
      admin
    );
  }

  /**
   * Retrieves paginated audit history of inventory movements.
   * Requires at least staff privileges.
   */
  async getMovements(
    filter: Partial<InventoryMovementFilterInput> = {},
    admin: AdminContext
  ): Promise<PaginatedResult<InventoryMovementItem>> {
    assertRole(admin, ["staff"]);

    const normalizedFilter: InventoryMovementFilterInput = {
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
      ...filter,
    };

    return this.repo.findMovementsPaginated(normalizedFilter);
  }

  // =========================================================================
  // Order Lifecycle Stock Primitives (Programmatic & Internal Integration)
  // =========================================================================

  /**
   * Atomically reserves stock for a customer order without decrementing quantityOnHand.
   * Throws ConflictError if available stock (quantityOnHand - quantityReserved) is insufficient.
   */
  async reserveStock(
    variantId: string,
    quantity: number,
    orderId?: string,
    executor: DatabaseExecutor = db
  ) {
    if (quantity <= 0) {
      throw new ValidationError("Reservation quantity must be greater than zero.");
    }

    const runner = async (tx: DatabaseExecutor) => {
      const current = await this.repo.findForUpdate(variantId, tx);
      if (!current) {
        throw new NotFoundError("Variant inventory", variantId);
      }

      const available = current.quantityOnHand - current.quantityReserved;
      if (available < quantity) {
        throw new ConflictError(
          `Insufficient available stock for variant '${variantId}'. Requested: ${quantity}, Available: ${available}.`
        );
      }

      const newReserved = current.quantityReserved + quantity;
      await this.repo.updateInventoryRow(
        current.id,
        { quantityReserved: newReserved },
        tx
      );

      return {
        success: true,
        variantId,
        reserved: quantity,
        newReserved,
        available: current.quantityOnHand - newReserved,
      };
    };

    return executor === db ? db.transaction((tx) => runner(tx)) : runner(executor);
  }

  /**
   * Releases previously reserved stock without modifying quantityOnHand.
   */
  async releaseReservedStock(
    variantId: string,
    quantity: number,
    orderId?: string,
    executor: DatabaseExecutor = db
  ) {
    if (quantity <= 0) {
      throw new ValidationError("Release quantity must be greater than zero.");
    }

    const runner = async (tx: DatabaseExecutor) => {
      const current = await this.repo.findForUpdate(variantId, tx);
      if (!current) {
        throw new NotFoundError("Variant inventory", variantId);
      }

      const newReserved = Math.max(0, current.quantityReserved - quantity);
      await this.repo.updateInventoryRow(
        current.id,
        { quantityReserved: newReserved },
        tx
      );

      return {
        success: true,
        variantId,
        released: quantity,
        newReserved,
      };
    };

    return executor === db ? db.transaction((tx) => runner(tx)) : runner(executor);
  }

  /**
   * Commits an order sale: permanently deducts quantityOnHand and clears the corresponding reservation,
   * then appends a 'sale' audit log entry.
   */
  async commitOrderSale(
    variantId: string,
    quantity: number,
    orderId?: string | null,
    adminId?: string,
    executor: DatabaseExecutor = db
  ) {
    if (quantity <= 0) {
      throw new ValidationError("Sale quantity must be greater than zero.");
    }

    const runner = async (tx: DatabaseExecutor) => {
      const current = await this.repo.findForUpdate(variantId, tx);
      if (!current) {
        throw new NotFoundError("Variant inventory", variantId);
      }

      // Idempotency check: if orderId is provided, check if a sale movement has already been committed
      if (orderId) {
        const [existingSale] = await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.orderId, orderId),
              eq(inventoryMovements.variantId, variantId),
              eq(inventoryMovements.reason, "sale")
            )
          )
          .limit(1);

        if (existingSale) {
          return {
            success: true,
            variantId,
            deducted: 0,
            newOnHand: current.quantityOnHand,
            newReserved: current.quantityReserved,
          };
        }
      }

      const newOnHand = current.quantityOnHand - quantity;
      if (newOnHand < 0) {
        throw new ConflictError("Cannot commit sale: resulting stock would be negative.");
      }

      const newReserved = Math.max(0, current.quantityReserved - quantity);

      await this.repo.updateInventoryRow(
        current.id,
        {
          quantityOnHand: newOnHand,
          quantityReserved: newReserved,
        },
        tx
      );

      await this.repo.insertMovement(
        {
          variantId,
          change: -quantity,
          reason: "sale",
          orderId: orderId || null,
          createdBy: adminId || null,
        },
        tx
      );

      return {
        success: true,
        variantId,
        deducted: quantity,
        newOnHand,
        newReserved,
      };
    };

    return executor === db ? db.transaction((tx) => runner(tx)) : runner(executor);
  }

  /**
   * Restores stock for a cancelled order:
   * - If the order was already committed (sale deducted): restores quantityOnHand and logs 'cancellation'.
   * - If the order was only reserved: releases quantityReserved.
   */
  async cancelOrderStock(
    variantId: string,
    quantity: number,
    orderId: string | null | undefined,
    wasCommitted: boolean,
    adminId?: string,
    executor: DatabaseExecutor = db
  ) {
    if (quantity <= 0) {
      throw new ValidationError("Cancellation quantity must be greater than zero.");
    }

    const runner = async (tx: DatabaseExecutor) => {
      const current = await this.repo.findForUpdate(variantId, tx);
      if (!current) {
        throw new NotFoundError("Variant inventory", variantId);
      }

      if (wasCommitted) {
        const newOnHand = current.quantityOnHand + quantity;
        await this.repo.updateInventoryRow(
          current.id,
          { quantityOnHand: newOnHand },
          tx
        );

        await this.repo.insertMovement(
          {
            variantId,
            change: quantity,
            reason: "cancellation",
            orderId: orderId || null,
            createdBy: adminId || null,
          },
          tx
        );
      } else {
        const newReserved = Math.max(0, current.quantityReserved - quantity);
        await this.repo.updateInventoryRow(
          current.id,
          { quantityReserved: newReserved },
          tx
        );
      }

      return {
        success: true,
        variantId,
        restored: quantity,
        wasCommitted,
      };
    };

    return executor === db ? db.transaction((tx) => runner(tx)) : runner(executor);
  }

  /**
   * Restores stock for returned items, increments quantityOnHand, and logs a 'return' movement.
   */
  async returnOrderStock(
    variantId: string,
    quantity: number,
    orderId?: string | null,
    adminId?: string,
    executor: DatabaseExecutor = db
  ) {
    if (quantity <= 0) {
      throw new ValidationError("Return quantity must be greater than zero.");
    }

    const runner = async (tx: DatabaseExecutor) => {
      const current = await this.repo.findForUpdate(variantId, tx);
      if (!current) {
        throw new NotFoundError("Variant inventory", variantId);
      }

      const newOnHand = current.quantityOnHand + quantity;
      await this.repo.updateInventoryRow(
        current.id,
        { quantityOnHand: newOnHand },
        tx
      );

      await this.repo.insertMovement(
        {
          variantId,
          change: quantity,
          reason: "return",
          orderId: orderId || null,
          createdBy: adminId || null,
        },
        tx
      );

      return {
        success: true,
        variantId,
        returned: quantity,
        newOnHand,
      };
    };

    return executor === db ? db.transaction((tx) => runner(tx)) : runner(executor);
  }
}

export const inventoryService = new InventoryService();
