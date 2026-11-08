import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { engravingOptions } from "../../db/schema/engraving.ts";
import { orderItemEngraving } from "../../db/schema/orders.ts";
import type { EngravingOption, NewEngravingOption } from "../../db/schema/types.ts";
import type { EngravingOptionFilter } from "../validation/engraving.ts";
import type { DatabaseExecutor } from "./base.repository.ts";

export class EngravingRepository {
  /**
   * Retrieves all engraving options sorted by creation date.
   */
  async findAll(
    filter?: EngravingOptionFilter,
    executor: DatabaseExecutor = db
  ): Promise<EngravingOption[]> {
    const conditions = [];

    if (filter?.type) {
      conditions.push(eq(engravingOptions.type, filter.type));
    }
    if (filter?.isActive !== undefined) {
      conditions.push(eq(engravingOptions.isActive, filter.isActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return executor
      .select()
      .from(engravingOptions)
      .where(whereClause)
      .orderBy(asc(engravingOptions.createdAt));
  }

  /**
   * Retrieves a single engraving option by ID.
   */
  async findById(id: string, executor: DatabaseExecutor = db): Promise<EngravingOption | null> {
    const [row] = await executor
      .select()
      .from(engravingOptions)
      .where(eq(engravingOptions.id, id))
      .limit(1);

    return row || null;
  }

  /**
   * Inserts a new engraving option.
   */
  async create(data: NewEngravingOption, executor: DatabaseExecutor = db): Promise<EngravingOption> {
    const [row] = await executor
      .insert(engravingOptions)
      .values(data)
      .returning();

    return row;
  }

  /**
   * Updates an existing engraving option.
   */
  async update(
    id: string,
    data: Partial<NewEngravingOption>,
    executor: DatabaseExecutor = db
  ): Promise<EngravingOption | null> {
    const [row] = await executor
      .update(engravingOptions)
      .set(data)
      .where(eq(engravingOptions.id, id))
      .returning();

    return row || null;
  }

  /**
   * Hard deletes an engraving option by ID.
   */
  async delete(id: string, executor: DatabaseExecutor = db): Promise<boolean> {
    const result = await executor
      .delete(engravingOptions)
      .where(eq(engravingOptions.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Counts how many historical order line items reference this engraving option.
   */
  async checkHasOrderUsages(id: string, executor: DatabaseExecutor = db): Promise<number> {
    const [result] = await executor
      .select({ count: count() })
      .from(orderItemEngraving)
      .where(eq(orderItemEngraving.engravingOptionId, id));

    return Number(result?.count ?? 0);
  }
}

export const engravingRepository = new EngravingRepository();
