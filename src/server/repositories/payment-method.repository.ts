import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { paymentMethods } from "../../db/schema/payment-methods.ts";
import type { PaymentMethod, NewPaymentMethod } from "../../db/schema/types.ts";
import type { DatabaseExecutor } from "./base.repository.ts";

export class PaymentMethodRepository {
  /**
   * Retrieves all payment methods sorted by display order.
   */
  async findAll(executor: DatabaseExecutor = db): Promise<PaymentMethod[]> {
    return executor
      .select()
      .from(paymentMethods)
      .orderBy(asc(paymentMethods.sortOrder));
  }

  /**
   * Retrieves a single payment method by ID.
   */
  async findById(id: string, executor: DatabaseExecutor = db): Promise<PaymentMethod | null> {
    const [row] = await executor
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .limit(1);

    return row || null;
  }

  /**
   * Retrieves a payment method by its system code (e.g. 'cod', 'bank_transfer', 'jazzcash').
   */
  async findByCode(code: string, executor: DatabaseExecutor = db): Promise<PaymentMethod | null> {
    const [row] = await executor
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.code, code.trim().toLowerCase()))
      .limit(1);

    return row || null;
  }

  /**
   * Updates an existing payment method.
   */
  async update(
    id: string,
    data: Partial<NewPaymentMethod>,
    executor: DatabaseExecutor = db
  ): Promise<PaymentMethod | null> {
    const [row] = await executor
      .update(paymentMethods)
      .set(data)
      .where(eq(paymentMethods.id, id))
      .returning();

    return row || null;
  }

  /**
   * Updates the sort order for multiple payment methods in batch using the provided executor.
   */
  async updateSortOrders(
    items: Array<{ id: string; sortOrder: number }>,
    tx: DatabaseExecutor
  ): Promise<void> {
    for (const item of items) {
      await tx
        .update(paymentMethods)
        .set({ sortOrder: item.sortOrder })
        .where(eq(paymentMethods.id, item.id));
    }
  }
}

export const paymentMethodRepository = new PaymentMethodRepository();
