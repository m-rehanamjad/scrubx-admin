import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { baUser } from "./auth.ts";

/**
 * Customers & Delivery Address Book
 *
 * Supports both registered accounts (linked to ba_user) and guest checkouts.
 * Triggers: updated_at is maintained automatically.
 * Security: RLS is enabled with zero direct public access.
 */

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => baUser.id, { onDelete: "set null" }).unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  notes: text("notes"), // Internal admin notes
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"), // e.g. "Hospital", "Clinic", "Home"
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(), // Required by Pakistani delivery couriers
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    province: text("province"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("PK"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_addresses_customer_id").on(table.customerId)]
);
