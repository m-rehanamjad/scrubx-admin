import { pgEnum } from "drizzle-orm/pg-core";

/**
 * PostgreSQL Database Enums & Role Constants
 *
 * All enums match types declared in PostgreSQL migrations.
 */

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "awaiting_payment",
  "payment_submitted",
  "pending", // COD orders
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "awaiting_verification",
  "paid",
  "rejected",
  "failed",
  "refunded",
]);

export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed_amount",
]);

export const engravingTypeEnum = pgEnum("engraving_type", [
  "name",
  "logo",
]);

/**
 * Canonical ScrubX User Roles (strictly lowercase)
 */
export const USER_ROLES = ["super_admin", "admin", "staff", "customer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLES = ["super_admin", "admin", "staff"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
