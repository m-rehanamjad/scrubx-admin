import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Payment Methods
 *
 * Configurable payment methods (JazzCash, Easypaisa, SadaPay, NayaPay, Bank Transfer, COD).
 * Security: RLS is enabled with zero direct public access.
 */

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // 'jazzcash' | 'easypaisa' | 'sadapay' | 'nayapay' | 'bank_transfer' | 'cod'
    name: text("name").notNull(), // Display title
    type: text("type").notNull(), // 'wallet' | 'bank_transfer' | 'cod'
    accountTitle: text("account_title"),
    accountNumber: text("account_number"),
    bankName: text("bank_name"),
    iban: text("iban"),
    instructions: text("instructions"), // e.g. "Send screenshot on WhatsApp with order number"
    /** Critical business rule: Cash on Delivery is strictly forbidden for custom engraved orders */
    allowedWithEngraving: boolean("allowed_with_engraving").notNull().default(true),
    supportsProof: boolean("supports_proof").notNull().default(false), // Admin UI screenshot badge
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "chk_payment_methods_type",
      sql`${table.type} IN ('wallet', 'bank_transfer', 'cod')`
    ),
  ]
);
