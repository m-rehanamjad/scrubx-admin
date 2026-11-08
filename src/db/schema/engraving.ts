import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  numeric,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { engravingTypeEnum } from "./enums.ts";

/**
 * Engraving Options
 *
 * Configurable options for surgical instrument / apparel personalization.
 * Security: RLS is enabled with zero public access.
 */

export const engravingOptions = pgTable(
  "engraving_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: engravingTypeEnum("type").notNull().default("name"),
    name: text("name").notNull(),
    description: text("description"),
    /** Price per engraved unit in PKR */
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    maxCharacters: integer("max_characters"), // Only applies to text engraving
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_engraving_options_price", sql`${table.price} >= 0`),
    check(
      "chk_engraving_options_max_chars",
      sql`${table.maxCharacters} IS NULL OR ${table.maxCharacters} > 0`
    ),
  ]
);
