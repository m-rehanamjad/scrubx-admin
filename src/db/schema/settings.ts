import {
  pgTable,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { baUser } from "./auth.ts";
import type { AnyStoreSettingValue } from "./json-types.ts";

/**
 * Store Settings Key-Value Store
 *
 * Configurable platform settings (WhatsApp contact number, order payment deadlines, notifications).
 * Triggers: trg_store_settings_updated_at maintains updated_at automatically.
 * Security: Row Level Security is enabled with zero direct public access. Never store secrets here.
 */

export const storeSettings = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<AnyStoreSettingValue>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => baUser.id, {
    onDelete: "set null",
  }),
});
