import { shippingRepository, ShippingRepository } from "../repositories/shipping.repository.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { db } from "../../db/index.ts";
import { ValidationError, NotFoundError } from "../errors.ts";
import {
  type CreateShippingMethodInput,
  type UpdateShippingMethodInput,
  type ShippingMethodFilter,
  createShippingMethodSchema,
  updateShippingMethodSchema,
} from "../validation/shipping.ts";
import type { ShippingMethod } from "../../db/schema/types.ts";

export class ShippingService {
  private readonly repo: ShippingRepository;

  constructor(repo: ShippingRepository = shippingRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves all shipping methods.
   * Requires at least staff role.
   */
  async getShippingMethods(
    filter?: ShippingMethodFilter,
    admin?: AdminContext
  ): Promise<ShippingMethod[]> {
    if (admin) {
      assertRole(admin, ["staff"]);
    }
    return this.repo.findAll(filter);
  }

  /**
   * Retrieves a single shipping method by ID.
   * Requires at least staff role.
   */
  async getShippingMethodById(id: string, admin: AdminContext): Promise<ShippingMethod> {
    assertRole(admin, ["staff"]);
    const method = await this.repo.findById(id);
    if (!method) {
      throw new NotFoundError("ShippingMethod", id);
    }
    return method;
  }

  /**
   * Creates a new shipping delivery method.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async createShippingMethod(
    input: CreateShippingMethodInput,
    admin: AdminContext
  ): Promise<ShippingMethod> {
    assertRole(admin, ["admin"]);

    const parseRes = createShippingMethodSchema.safeParse(input);
    if (!parseRes.success) {
      throw new ValidationError(parseRes.error.issues.map((i) => i.message).join(", "));
    }
    const data = parseRes.data;

    if (data.minDays != null && data.maxDays != null && data.maxDays < data.minDays) {
      throw new ValidationError("Maximum delivery days cannot be less than minimum delivery days.");
    }

    return this.repo.create({
      name: data.name.trim(),
      description: data.description ?? null,
      price: String(data.price),
      freeAbove: data.freeAbove != null ? String(data.freeAbove) : null,
      estimatedDays: data.estimatedDays ?? null,
      minDays: data.minDays ?? null,
      maxDays: data.maxDays ?? null,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    });
  }

  /**
   * Updates an existing shipping method with complete merged entity validation.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async updateShippingMethod(
    input: UpdateShippingMethodInput,
    admin: AdminContext
  ): Promise<ShippingMethod> {
    assertRole(admin, ["admin"]);

    const parseRes = updateShippingMethodSchema.safeParse(input);
    if (!parseRes.success) {
      throw new ValidationError(parseRes.error.issues.map((i) => i.message).join(", "));
    }
    const data = parseRes.data;

    const existing = await this.repo.findById(data.id);
    if (!existing) {
      throw new NotFoundError("ShippingMethod", data.id);
    }

    // Merge partial update with existing record
    const merged = {
      ...existing,
      ...data,
      minDays: data.minDays !== undefined ? data.minDays : existing.minDays,
      maxDays: data.maxDays !== undefined ? data.maxDays : existing.maxDays,
      price: data.price !== undefined ? String(data.price) : existing.price,
      freeAbove: data.freeAbove !== undefined ? (data.freeAbove != null ? String(data.freeAbove) : null) : existing.freeAbove,
    };

    // Validate merged delivery window
    if (merged.minDays != null && merged.maxDays != null && merged.maxDays < merged.minDays) {
      throw new ValidationError("Maximum delivery days cannot be less than minimum delivery days.");
    }

    const updated = await this.repo.update(data.id, {
      name: data.name !== undefined ? data.name.trim() : existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      price: merged.price,
      freeAbove: merged.freeAbove,
      estimatedDays: data.estimatedDays !== undefined ? data.estimatedDays : existing.estimatedDays,
      minDays: merged.minDays,
      maxDays: merged.maxDays,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
    });

    return updated!;
  }

  /**
   * Toggles active status of a shipping method.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async toggleShippingMethodStatus(
    id: string,
    isActive: boolean,
    admin: AdminContext
  ): Promise<ShippingMethod> {
    assertRole(admin, ["admin"]);

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("ShippingMethod", id);
    }

    const updated = await this.repo.update(id, { isActive });
    return updated!;
  }

  /**
   * Safely deletes or deactivates a shipping method.
   * If historical orders reference this method, safely deactivates to preserve foreign keys.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async deleteShippingMethod(
    id: string,
    admin: AdminContext
  ): Promise<{ deleted: boolean; deactivated: boolean; message: string }> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError("ShippingMethod", id);
      }

      const orderRefs = await this.repo.checkHasOrderReferences(id, tx);
      if (orderRefs > 0) {
        await this.repo.update(id, { isActive: false }, tx);
        return {
          deleted: false,
          deactivated: true,
          message: `Shipping method '${existing.name}' is referenced by ${orderRefs} orders and was deactivated instead of deleted.`,
        };
      }

      await this.repo.delete(id, tx);
      return {
        deleted: true,
        deactivated: false,
        message: `Shipping method '${existing.name}' was permanently deleted.`,
      };
    });
  }

  /**
   * Atomically reorders shipping methods within a transaction.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async reorderShippingMethods(
    items: Array<{ id: string; sortOrder: number }>,
    admin: AdminContext
  ): Promise<void> {
    assertRole(admin, ["admin"]);

    // Check for duplicate IDs in payload
    const idSet = new Set<string>();
    for (const item of items) {
      if (idSet.has(item.id)) {
        throw new ValidationError(`Duplicate shipping method ID '${item.id}' in reorder payload.`);
      }
      idSet.add(item.id);
    }

    return db.transaction(async (tx) => {
      // Validate all IDs exist in database
      for (const item of items) {
        const method = await this.repo.findById(item.id, tx);
        if (!method) {
          throw new NotFoundError("ShippingMethod", item.id);
        }
      }

      await this.repo.updateSortOrders(items, tx);
    });
  }

  /**
   * Calculates shipping delivery fee based on method configuration and order subtotal.
   */
  calculateShippingCost(method: ShippingMethod, subtotal: number): number {
    const freeAbove = method.freeAbove ? Number(method.freeAbove) : null;
    if (freeAbove !== null && subtotal >= freeAbove) {
      return 0;
    }
    return Number(method.price);
  }
}

export const shippingService = new ShippingService();
