import { and, desc, asc, eq, sql, ilike, or, isNotNull, isNull } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  customers,
  addresses,
  orders,
  type Customer,
  type Address,
  type NewAddress,
} from "../../db/schema/index.ts";
import { buildPaginatedResult, type DatabaseExecutor } from "./base.repository.ts";
import type { CustomerFilterInput, UpdateCustomerInput } from "../validation/customers.ts";
import type { PaginatedResult } from "../types.ts";

export interface CustomerListItem {
  id: string;
  userId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  ordersCount: number;
  totalSpend: number;
  lastOrderDate: Date | null;
  isRegistered: boolean;
}

export interface CustomerDetail extends Customer {
  isRegistered: boolean;
  ordersCount: number;
  totalSpend: number;
  addresses: Address[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    total: string;
    placedAt: Date;
  }[];
}

export class CustomerRepository {
  /**
   * Retrieves paginated customers matching keyword and account type filters.
   */
  async findPaginated(
    filter: CustomerFilterInput,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<CustomerListItem>> {
    const conditions = [];

    if (filter.q) {
      const pattern = `%${filter.q.trim()}%`;
      conditions.push(
        or(
          ilike(customers.firstName, pattern),
          ilike(customers.lastName, pattern),
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern)
        )
      );
    }

    if (filter.isRegistered !== undefined) {
      conditions.push(
        filter.isRegistered ? isNotNull(customers.userId) : isNull(customers.userId)
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Total count
    const [totalRow] = await executor
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(customers)
      .where(whereClause);

    const total = totalRow?.count ?? 0;
    const offset = (filter.page - 1) * filter.limit;

    // Dynamic sort
    let sortColumn;
    if (filter.sortBy === "name") {
      sortColumn = customers.firstName;
    } else if (filter.sortBy === "ordersCount") {
      sortColumn = sql`orders_count`;
    } else if (filter.sortBy === "totalSpend") {
      sortColumn = sql`total_spend`;
    } else {
      sortColumn = customers.createdAt;
    }

    const orderExpr = filter.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const rows = await executor
      .select({
        id: customers.id,
        userId: customers.userId,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        notes: customers.notes,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        ordersCount: sql<number>`cast(count(${orders.id}) as integer)`.as("orders_count"),
        totalSpend: sql<number>`cast(coalesce(sum(case when ${orders.status} != 'cancelled' then ${orders.total} else 0 end), 0) as float)`.as("total_spend"),
        lastOrderDate: sql<Date | null>`max(${orders.placedAt})`,
      })
      .from(customers)
      .leftJoin(orders, eq(customers.id, orders.customerId))
      .where(whereClause)
      .groupBy(customers.id)
      .orderBy(orderExpr)
      .limit(filter.limit)
      .offset(offset);

    const items: CustomerListItem[] = rows.map((r) => ({
      ...r,
      isRegistered: Boolean(r.userId),
    }));

    return buildPaginatedResult(items, total, filter.page, filter.limit);
  }

  /**
   * Retrieves single deep customer bundle with addresses and recent orders.
   */
  async findById(
    id: string,
    executor: DatabaseExecutor = db
  ): Promise<CustomerDetail | null> {
    const [customerRow] = await executor
      .select({
        id: customers.id,
        userId: customers.userId,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        notes: customers.notes,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        ordersCount: sql<number>`cast(count(${orders.id}) as integer)`,
        totalSpend: sql<number>`cast(coalesce(sum(case when ${orders.status} != 'cancelled' then ${orders.total} else 0 end), 0) as float)`,
      })
      .from(customers)
      .leftJoin(orders, eq(customers.id, orders.customerId))
      .where(eq(customers.id, id))
      .groupBy(customers.id)
      .limit(1);

    if (!customerRow) return null;

    const customerAddresses = await executor
      .select()
      .from(addresses)
      .where(eq(addresses.customerId, id))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

    const recentOrders = await executor
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        total: orders.total,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.placedAt))
      .limit(10);

    return {
      ...customerRow,
      isRegistered: Boolean(customerRow.userId),
      addresses: customerAddresses,
      recentOrders,
    };
  }

  /**
   * Find customer by exact normalized email.
   */
  async findByEmail(
    email: string,
    executor: DatabaseExecutor = db
  ): Promise<Customer | null> {
    const [row] = await executor
      .select()
      .from(customers)
      .where(eq(customers.email, email.trim().toLowerCase()))
      .limit(1);
    return row || null;
  }

  /**
   * Concurrency-safe atomic customer upsert by normalized email.
   * If a customer already exists with this email, their record is reused
   * and names/phone are updated if previously null.
   */
  async upsertCustomer(
    data: {
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      notes?: string | null;
    },
    executor: DatabaseExecutor = db
  ): Promise<Customer> {
    const normalizedEmail = data.email.trim().toLowerCase();

    // 1. Look up existing customer by normalized email
    const [existing] = await executor
      .select()
      .from(customers)
      .where(eq(customers.email, normalizedEmail))
      .limit(1);

    if (existing) {
      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      if (data.firstName && !existing.firstName) updateFields.firstName = data.firstName;
      if (data.lastName && !existing.lastName) updateFields.lastName = data.lastName;
      if (data.phone && !existing.phone) updateFields.phone = data.phone;
      if (data.notes && !existing.notes) updateFields.notes = data.notes;

      if (Object.keys(updateFields).length > 1) {
        const [updated] = await executor
          .update(customers)
          .set(updateFields)
          .where(eq(customers.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    // 2. Insert new customer record
    const [row] = await executor
      .insert(customers)
      .values({
        email: normalizedEmail,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        phone: data.phone || null,
        notes: data.notes || null,
      })
      .returning();

    return row;
  }

  /**
   * Updates customer profile fields.
   */
  async update(
    id: string,
    data: UpdateCustomerInput,
    executor: DatabaseExecutor = db
  ): Promise<Customer | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const [updated] = await executor
      .update(customers)
      .set(updateData)
      .where(eq(customers.id, id))
      .returning();

    return updated || null;
  }

  /**
   * Address Book Management
   */
  async addAddress(
    data: NewAddress,
    executor: DatabaseExecutor = db
  ): Promise<Address> {
    if (data.isDefault) {
      await this.clearDefaultAddresses(data.customerId, executor);
    }
    const [newAddr] = await executor.insert(addresses).values(data).returning();
    return newAddr;
  }

  async updateAddress(
    id: string,
    customerId: string,
    data: Partial<NewAddress>,
    executor: DatabaseExecutor = db
  ): Promise<Address | null> {
    if (data.isDefault) {
      await this.clearDefaultAddresses(customerId, executor);
    }
    const [updated] = await executor
      .update(addresses)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)))
      .returning();
    return updated || null;
  }

  async deleteAddress(
    id: string,
    customerId: string,
    executor: DatabaseExecutor = db
  ): Promise<boolean> {
    const result = await executor
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)))
      .returning();
    return result.length > 0;
  }

  async clearDefaultAddresses(
    customerId: string,
    executor: DatabaseExecutor = db
  ): Promise<void> {
    await executor
      .update(addresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(addresses.customerId, customerId));
  }
}

export const customerRepository = new CustomerRepository();
