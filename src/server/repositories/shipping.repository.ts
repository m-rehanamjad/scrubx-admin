import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { shippingMethods } from "../../db/schema/shipping.ts";
import { orders } from "../../db/schema/orders.ts";
import type { ShippingMethod, NewShippingMethod } from "../../db/schema/types.ts";
import type { ShippingMethodFilter } from "../validation/shipping.ts";
import type { DatabaseExecutor } from "./base.repository.ts";

export class ShippingRepository {
  /**
   * Retrieves all shipping methods sorted by sortOrder and creation date.
   */
  async findAll(
    filter?: ShippingMethodFilter,
    executor: DatabaseExecutor = db
  ): Promise<ShippingMethod[]> {
    const conditions = [];
    if (filter?.isActive !== undefined) {
      conditions.push(eq(shippingMethods.isActive, filter.isActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return executor
      .select()
      .from(shippingMethods)
      .where(whereClause)
      .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.createdAt));
  }

  /**
   * Retrieves a single shipping method by ID.
   */
  async findById(id: string, executor: DatabaseExecutor = db): Promise<ShippingMethod | null> {
    const [row] = await executor
      .select()
      .from(shippingMethods)
      .where(eq(shippingMethods.id, id))
      .limit(1);

    return row || null;
  }

  /**
   * Inserts a new shipping method.
   */
  async create(data: NewShippingMethod, executor: DatabaseExecutor = db): Promise<ShippingMethod> {
    const [row] = await executor
      .insert(shippingMethods)
      .values(data)
      .returning();

    return row;
  }

  /**
   * Updates an existing shipping method.
   */
  async update(
    id: string,
    data: Partial<NewShippingMethod>,
    executor: DatabaseExecutor = db
  ): Promise<ShippingMethod | null> {
    const [row] = await executor
      .update(shippingMethods)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(shippingMethods.id, id))
      .returning();

    return row || null;
  }

  /**
   * Hard deletes a shipping method by ID.
   */
  async delete(id: string, executor: DatabaseExecutor = db): Promise<boolean> {
    const result = await executor
      .delete(shippingMethods)
      .where(eq(shippingMethods.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Counts how many historical orders reference this shipping method.
   */
  async checkHasOrderReferences(id: string, executor: DatabaseExecutor = db): Promise<number> {
    const [result] = await executor
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.shippingMethodId, id));

    return Number(result?.count ?? 0);
  }

  /**
   * Updates the sort order for multiple shipping methods in batch using the provided executor.
   */
  async updateSortOrders(
    items: Array<{ id: string; sortOrder: number }>,
    tx: DatabaseExecutor
  ): Promise<void> {
    for (const item of items) {
      await tx
        .update(shippingMethods)
        .set({
          sortOrder: item.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(shippingMethods.id, item.id));
    }
  }
}

export const shippingRepository = new ShippingRepository();
