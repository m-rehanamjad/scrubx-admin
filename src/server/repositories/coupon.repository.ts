import { and, desc, eq, ilike, ne, or, sql, count } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { coupons } from "../../db/schema/coupons.ts";
import { orders, orderCoupons } from "../../db/schema/orders.ts";
import { customers } from "../../db/schema/customers.ts";
import type { Coupon, NewCoupon } from "../../db/schema/types.ts";
import type { CouponFilter, CouponUsageFilter } from "../validation/coupons.ts";
import { buildPaginatedResult, type DatabaseExecutor, type PaginatedResult } from "./base.repository.ts";

export type CouponStatus = "active" | "scheduled" | "inactive" | "expired";

export interface CouponListItem extends Coupon {
  computedStatus: CouponStatus;
}

export interface CouponUsageRecord {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  discountAmount: string;
  usedAt: Date;
}

export class CouponRepository {
  /**
   * Derives real-time coupon status against the current timestamp.
   */
  deriveStatus(coupon: Coupon, now = new Date()): CouponStatus {
    if (!coupon.isActive) {
      return "inactive";
    }
    if (new Date(coupon.startsAt) > now) {
      return "scheduled";
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) {
      return "expired";
    }
    return "active";
  }

  /**
   * Retrieves paginated coupons with real-time status and search filtering.
   */
  async findPaginated(
    filter: CouponFilter,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<CouponListItem>> {
    const conditions = [];

    if (filter.q && filter.q.trim()) {
      const search = `%${filter.q.trim().toUpperCase()}%`;
      conditions.push(
        or(
          ilike(coupons.code, search),
          ilike(coupons.description, `%${filter.q.trim()}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const now = new Date();

    // Query all matching for accurate total and status evaluation
    const orderColumn =
      filter.sortBy === "code"
        ? coupons.code
        : filter.sortBy === "discountValue"
          ? coupons.discountValue
          : filter.sortBy === "expiresAt"
            ? coupons.expiresAt
            : filter.sortBy === "usageCount"
              ? coupons.usageCount
              : coupons.createdAt;

    const orderExpr = filter.sortOrder === "asc" ? sql`${orderColumn} ASC NULLS LAST` : sql`${orderColumn} DESC NULLS LAST`;

    const allRows = await executor
      .select()
      .from(coupons)
      .where(whereClause)
      .orderBy(orderExpr);

    // Apply status filter in-memory with exact timestamp evaluation
    const filteredRows = allRows
      .map((row) => ({
        ...row,
        computedStatus: this.deriveStatus(row, now),
      }))
      .filter((row) => {
        if (filter.status === "all") return true;
        return row.computedStatus === filter.status;
      });

    const total = filteredRows.length;
    const offset = (filter.page - 1) * filter.limit;
    const paginatedItems = filteredRows.slice(offset, offset + filter.limit);

    return buildPaginatedResult(paginatedItems, total, filter.page, filter.limit);
  }

  /**
   * Finds a coupon by its primary key UUID.
   */
  async findById(id: string, executor: DatabaseExecutor = db): Promise<Coupon | null> {
    const [row] = await executor
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    return row || null;
  }

  /**
   * Finds a coupon by uppercase code.
   */
  async findByCode(code: string, executor: DatabaseExecutor = db): Promise<Coupon | null> {
    const [row] = await executor
      .select()
      .from(coupons)
      .where(eq(coupons.code, code.trim().toUpperCase()))
      .limit(1);

    return row || null;
  }

  /**
   * Acquires exclusive pessimistic row lock on coupon record for concurrent redemptions.
   */
  async findForUpdateByCode(code: string, tx: DatabaseExecutor): Promise<Coupon | null> {
    const [row] = await tx
      .select()
      .from(coupons)
      .where(eq(coupons.code, code.trim().toUpperCase()))
      .for("update");

    return row || null;
  }

  /**
   * Inserts a new coupon.
   */
  async create(data: NewCoupon, executor: DatabaseExecutor = db): Promise<Coupon> {
    const [row] = await executor
      .insert(coupons)
      .values({
        ...data,
        code: data.code.trim().toUpperCase(),
      })
      .returning();

    return row;
  }

  /**
   * Updates an existing coupon by ID.
   */
  async update(id: string, data: Partial<NewCoupon>, executor: DatabaseExecutor = db): Promise<Coupon | null> {
    const valuesToUpdate = { ...data };
    if (valuesToUpdate.code) {
      valuesToUpdate.code = valuesToUpdate.code.trim().toUpperCase();
    }

    const [row] = await executor
      .update(coupons)
      .set(valuesToUpdate)
      .where(eq(coupons.id, id))
      .returning();

    return row || null;
  }

  /**
   * Hard deletes a coupon by ID.
   */
  async delete(id: string, executor: DatabaseExecutor = db): Promise<boolean> {
    const result = await executor
      .delete(coupons)
      .where(eq(coupons.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Counts how many historical order_coupons records reference this coupon.
   */
  async checkHasOrderUsages(couponId: string, executor: DatabaseExecutor = db): Promise<number> {
    const [result] = await executor
      .select({ count: count() })
      .from(orderCoupons)
      .where(eq(orderCoupons.couponId, couponId));

    return Number(result?.count ?? 0);
  }

  /**
   * Counts how many non-cancelled orders by a specific customer applied this coupon.
   */
  async getCustomerUsageCount(couponId: string, customerId: string, executor: DatabaseExecutor = db): Promise<number> {
    const [result] = await executor
      .select({ count: count() })
      .from(orderCoupons)
      .innerJoin(orders, eq(orderCoupons.orderId, orders.id))
      .where(
        and(
          eq(orderCoupons.couponId, couponId),
          eq(orders.customerId, customerId),
          ne(orders.status, "cancelled")
        )
      );

    return Number(result?.count ?? 0);
  }

  /**
   * Counts how many non-cancelled orders a customer has placed.
   */
  async getCustomerOrderCount(customerId: string, executor: DatabaseExecutor = db): Promise<number> {
    const [result] = await executor
      .select({ count: count() })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, customerId),
          ne(orders.status, "cancelled")
        )
      );

    return Number(result?.count ?? 0);
  }

  /**
   * Inserts an order_coupons record and atomically increments coupon usage count.
   * Runs within the order creation transaction.
   */
  async recordRedemption(
    orderId: string,
    couponId: string,
    discountAmount: string,
    tx: DatabaseExecutor
  ): Promise<void> {
    await tx.insert(orderCoupons).values({
      orderId,
      couponId,
      discountAmount,
    });

    await tx
      .update(coupons)
      .set({ usageCount: sql`${coupons.usageCount} + 1` })
      .where(eq(coupons.id, couponId));
  }

  /**
   * Retrieves paginated usage history for a coupon joined with orders and customers.
   */
  async findUsageHistory(
    filter: CouponUsageFilter,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<CouponUsageRecord>> {
    const offset = (filter.page - 1) * filter.limit;

    const [totalRes] = await executor
      .select({ count: count() })
      .from(orderCoupons)
      .where(eq(orderCoupons.couponId, filter.couponId));

    const total = Number(totalRes?.count ?? 0);

    const rows = await executor
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        customerId: customers.id,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerEmail: customers.email,
        discountAmount: orderCoupons.discountAmount,
        usedAt: orderCoupons.createdAt,
      })
      .from(orderCoupons)
      .innerJoin(orders, eq(orderCoupons.orderId, orders.id))
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orderCoupons.couponId, filter.couponId))
      .orderBy(desc(orderCoupons.createdAt))
      .limit(filter.limit)
      .offset(offset);

    const items: CouponUsageRecord[] = rows.map((r) => ({
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      orderStatus: r.orderStatus,
      customerId: r.customerId,
      customerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ") || r.customerEmail,
      customerEmail: r.customerEmail,
      discountAmount: r.discountAmount,
      usedAt: r.usedAt,
    }));

    return buildPaginatedResult(items, total, filter.page, filter.limit);
  }
}

export const couponRepository = new CouponRepository();
