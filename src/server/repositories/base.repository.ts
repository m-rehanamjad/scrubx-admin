import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "../../db/schema/index.ts";
import { db } from "../../db/index.ts";
import type { PaginatedResult } from "../types.ts";
export type { PaginatedResult };

/**
 * Universal executor type that accepts either the main Drizzle database instance
 * or an active transaction scope.
 */
export type DatabaseExecutor =
  | typeof db
  | PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;

/**
 * Calculates SQL offset based on 1-indexed page number and limit.
 */
export function buildPaginationOffset(page: number, limit: number): number {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  return (safePage - 1) * safeLimit;
}

/**
 * Constructs a standardized PaginatedResult object.
 */
export function buildPaginatedResult<T>(
  items: T[],
  totalItems: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const safeLimit = Math.max(1, limit);
  const totalPages = Math.ceil(totalItems / safeLimit) || 1;

  return {
    items,
    pagination: {
      page: Math.max(1, page),
      limit: safeLimit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
