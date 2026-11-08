# ScrubX Admin — Database Context & Schema Specification

> **Permanent AI Context Documentation**  
> *Last Updated: November 2026 (Phase 3 Finalized)*

---

## 1. PostgreSQL & Connection Configuration

- **Provider:** Managed PostgreSQL hosted on **Supabase** (PostgreSQL version `17.x`).
- **Connection Mode:** Supavisor Transaction Pooler on port `6543`.
- **Environment Variable:** `DATABASE_URL` configured in `.env.local`.
- **Driver:** `postgres` (`postgres.js` v3.4.5) paired with `drizzle-orm` (v0.38.4).

### Key Driver Settings ([`src/db/index.ts`](file:///home/rehan/Downloads/scrubX-admin/src/db/index.ts))
1. `prepare: false`: **Mandatory.** Supavisor transaction-mode poolers route consecutive queries across different internal client sessions; prepared statements are therefore disabled.
2. `max: 10` (Production) / `max: 3` (Development): Prevents exhausting Supabase database connection limits.
3. `idle_timeout: 20` & `connect_timeout: 10`: Reclaims stale connections cleanly.
4. `globalThis.__scrubx_postgres_client__`: Caches the client instance during development to prevent connection leaks across Next.js Hot Module Reloads.
5. `typeof window !== "undefined"`: Hard security barrier preventing database code from being imported into client components.

---

## 2. Modular Schema Directory Architecture

In Phase 3, the monolithic `src/db/schema.ts` facade was removed. The database schema is cleanly organized into domain-driven modular files inside [`src/db/schema/`](file:///home/rehan/Downloads/scrubX-admin/src/db/schema/):

```
src/db/schema/
├── json-types.ts       # Non-circular TypeScript interfaces for JSONB columns
├── json-schemas.ts     # Zod validation schemas matching JSONB types
├── enums.ts            # PostgreSQL ENUM types and canonical lowercase roles
├── auth.ts             # Better Auth tables (ba_user, ba_session, ba_account, ba_verification)
├── catalog.ts          # product_categories, products, product_colors, product_variants, product_images
├── inventory.ts        # inventory, inventory_movements
├── engraving.ts        # engraving_options
├── customers.ts        # customers, addresses
├── shipping.ts         # shipping_methods
├── coupons.ts          # coupons
├── payment-methods.ts  # payment_methods
├── orders.ts           # orders, order_items, order_item_engraving, order_coupons, order_notes, order_status_history
├── payments.ts         # payments
├── settings.ts         # store_settings
├── relations.ts        # Drizzle ORM relations mappings
├── types.ts            # Inferred select & insert types (BaUser, Order, Product, etc.)
└── index.ts            # Root barrel export
```

### Drizzle Configuration ([`drizzle.config.ts`](file:///home/rehan/Downloads/scrubX-admin/drizzle.config.ts))
```typescript
import { defineConfig } from "drizzle-kit";
import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  verbose: true,
  strict: true,
});
```

---

## 3. Database Schema Overview (25 Tables)

All 25 tables have been migrated to live Supabase PostgreSQL and have **Row Level Security (RLS) strictly enabled** with zero direct public access. Server connections bypass RLS via privileged credentials.

### Domain 1: Authentication (Better Auth)
| Table | Description | Key Columns |
|---|---|---|
| `ba_user` | Core user identity & roles | `id`, `name`, `email` (UQ), `email_verified`, `role` (`super_admin`, `admin`, `staff`, `customer`), `banned` |
| `ba_session` | User sessions & tokens | `id`, `user_id` (FK cascade), `token` (UQ), `expires_at`, `ip_address`, `user_agent`, `impersonated_by` |
| `ba_account` | Credentials & OAuth providers | `id`, `account_id`, `provider_id`, `user_id` (FK cascade), `password` (hashed) |
| `ba_verification` | Verification tokens | `id`, `identifier`, `value`, `expires_at` |

### Domain 2: Product Catalog & Variations
| Table | Description | Key Columns |
|---|---|---|
| `product_categories` | Hierarchical categories | `id`, `parent_id` (self-FK), `name` (UQ), `slug` (UQ), `image_url`, `image_file_id` (ImageKit), `sort_order`, `is_active` |
| `products` | Master product listings | `id`, `name`, `slug` (UQ), `description`, `status` (`draft`, `active`, `archived`), `category_id` (FK), `brand`, `gender` (`men`, `women`, `unisex`), `material`, `is_engravable`, `is_featured`, `deleted_at` |
| `product_colors` | Color swatches for product | `id`, `product_id` (FK cascade), `name`, `hex_code` (`#RRGGBB`), `sort_order`. Unique: `(product_id, name)` |
| `product_variants` | Size & color combinations | `id`, `product_id` (FK cascade), `color_id` (FK), `sku` (UQ), `name`, `size`, `size_sort_order`, `price` (numeric), `compare_at_price`, `attributes` (`VariantAttributes`), `is_active`. Unique: `(product_id, color_id, size)` |
| `product_images` | Product photo gallery | `id`, `product_id` (FK cascade), `color_id` (FK cascade, nullable), `imagekit_file_id` (UQ), `url`, `thumbnail_url`, `alt_text`, `sort_order` (`0` = main image) |

### Domain 3: Inventory Management
| Table | Description | Key Columns |
|---|---|---|
| `inventory` | Stock tracking per variant | `id`, `variant_id` (FK cascade, UQ), `quantity_on_hand` ($\ge 0$), `quantity_reserved` ($\ge 0, \le \text{on\_hand}$), `reorder_level` ($\ge 0$) |
| `inventory_movements` | Stock adjustment audit trail | `id`, `variant_id` (FK cascade), `change` (integer $\pm$), `reason` (`restock`, `sale`, `cancellation`, `adjustment`, `return`), `order_id` (FK), `created_by` (FK to `ba_user`) |

### Domain 4: Custom Personalization (Engraving)
| Table | Description | Key Columns |
|---|---|---|
| `engraving_options` | Available engraving services | `id`, `type` (`name`, `logo`), `name`, `description`, `price` (numeric $\ge 0$), `max_characters`, `is_active` |

### Domain 5: Customers & Addresses
| Table | Description | Key Columns |
|---|---|---|
| `customers` | Customer profiles (registered & guest) | `id`, `user_id` (FK to `ba_user`, nullable), `email` (UQ), `first_name`, `last_name`, `phone`, `notes` |
| `addresses` | Saved customer delivery addresses | `id`, `customer_id` (FK cascade), `label`, `full_name`, `phone`, `address_line1`, `address_line2`, `city`, `province`, `postal_code`, `country` (`PK`), `is_default` |

### Domain 6: Shipping & Promotions
| Table | Description | Key Columns |
|---|---|---|
| `shipping_methods` | Courier delivery tiers | `id`, `name`, `description`, `price` (numeric $\ge 0$), `free_above`, `estimated_days`, `min_days`, `max_days`, `is_active`, `sort_order` |
| `coupons` | Discount voucher codes | `id`, `code` (case-insensitive UQ), `discount_type` (`percentage`, `fixed_amount`), `discount_value`, `minimum_order_amount`, `maximum_discount_amount`, `usage_limit`, `usage_limit_per_customer`, `usage_count`, `first_order_only`, `starts_at`, `expires_at`, `is_active` |

### Domain 7: Payments & Pakistani Gateway Support
| Table | Description | Key Columns |
|---|---|---|
| `payment_methods` | Manual & wallet channels | `id`, `code` (UQ), `name`, `type` (`wallet`, `bank_transfer`, `cod`), `account_title`, `account_number`, `bank_name`, `iban`, `instructions`, `allowed_with_engraving`, `supports_proof`, `is_active`, `sort_order` |
| `payments` | Customer payment records | `id`, `order_id` (FK), `payment_method_id` (FK), `status` (`pending`, `awaiting_verification`, `paid`, `rejected`, `failed`, `refunded`), `amount`, `currency` (`PKR`), `sender_name`, `sender_account_last4`, `transaction_reference` (TID), `proof_url`, `metadata` (`PaymentMetadata`), `verified_by` (FK to `ba_user`), `verified_at`, `rejection_reason`, `paid_at` |

### Domain 8: Orders & Fulfillment
| Table | Description | Key Columns |
|---|---|---|
| `orders` | Customer order records | `id`, `order_number` (UQ, formatted `SX-1001`), `customer_id` (FK), `status` (`order_status`), `subtotal`, `engraving_total`, `discount_total`, `shipping_total`, `tax_total`, `total`, `has_engraving`, `payment_method_id` (FK), `shipping_method_id` (FK), `shipping_address` (`ShippingAddressSnapshot`), `courier`, `tracking_number`, `idempotency_key` (UQ) |
| `order_items` | Purchased line items | `id`, `order_id` (FK cascade), `variant_id` (FK), `sku`, `product_name`, `variant_name`, `unit_price`, `quantity`, `line_total` (**STORED GENERATED: unit_price * quantity**) |
| `order_item_engraving` | Line item personalization details | `id`, `order_item_id` (FK cascade), `engraving_option_id` (FK), `text`, `logo_url`, `logo_imagekit_file_id`, `placement`, `price`. Unique: `(order_item_id, engraving_option_id)` |
| `order_coupons` | Applied discounts on order | `order_id` (FK cascade), `coupon_id` (FK), `discount_amount`. Composite PK: `(order_id, coupon_id)` |
| `order_notes` | **NEW** Internal staff order notes | `id` (uuid PK), `order_id` (FK cascade), `body` (text non-empty), `created_by` (FK to `ba_user`), `created_at` |
| `order_status_history` | Order state machine audit log | `id`, `order_id` (FK cascade), `from_status`, `to_status`, `note`, `changed_by`, `created_at` |

### Domain 9: Platform Configuration
| Table | Description | Key Columns |
|---|---|---|
| `store_settings` | Key-value store | `key` (text PK), `value` (`StoreSettingsMap`), `updated_at`, `updated_by` (FK to `ba_user`) |

---

## 4. Strict JSONB Column Typings ([`src/db/schema/json-types.ts`](file:///home/rehan/Downloads/scrubX-admin/src/db/schema/json-types.ts))

No index signatures (`[key: string]: unknown`) and no invented fields:

```typescript
export interface VariantAttributes {
  manual?: boolean;
}

export interface ShippingAddressSnapshot {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
  country: string;
}

export interface PaymentMetadata {
  customerNotes?: string;
}

export interface StoreSettingsMap {
  whatsapp_number: string;
  payment_deadline_hours: number;
  store_name: string;
  tagline: string;
  support_email: string;
  support_phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  default_shipping_method_id: string;
  order_confirmation_auto: boolean;
  low_stock_alerts: boolean;
  new_order_email: boolean;
  new_order_whatsapp: boolean;
  payment_submitted_alert: boolean;
  daily_summary: boolean;
}
```

Runtime validation is provided by matching Zod schemas in [`src/db/schema/json-schemas.ts`](file:///home/rehan/Downloads/scrubX-admin/src/db/schema/json-schemas.ts).

---

## 5. Stored Generated Columns

- `order_items.line_total` is declared in PostgreSQL as `numeric(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED`.
- In Drizzle schema, it uses `.generatedAlwaysAs(sql\`("unit_price" * "quantity")\`)`.
- In TypeScript, `NewOrderItem` insert type strictly excludes `lineTotal`. Any explicit insert into `line_total` is rejected by PostgreSQL.

---

## 6. PostgreSQL Database Triggers & Business Rules

1. `check_engraving_cod_rule()` on `orders`: Rejects any order where `has_engraving = true` and `payment_method_id` references a payment method where `allowed_with_engraving = false` (e.g. Cash on Delivery).
2. `generate_order_number()` on `orders`: Automatically assigns human-readable order numbers from sequence `order_number_seq` (e.g. `SX-1001`).
3. `update_updated_at_column()` on `ba_user`, `product_categories`, `products`, `product_variants`, `customers`, `addresses`, `shipping_methods`, `orders`, `payments`, `store_settings`.

---

## 7. Migration Files

Migrations are raw SQL files inside [`supabase/migrations/`](file:///home/rehan/Downloads/scrubX-admin/supabase/migrations/):
1. `20261105000000_initial_schema.sql`: Initial schema (24 tables, enums, triggers, sequence, RLS lockdown).
2. `20261105000001_phase3_schema_refinements.sql`: Role normalization to lowercase, `order_notes` table, `image_file_id`, and UI alignment columns.

Migration runner: `npm run db:migrate` tracks applied migrations in table `_app_migrations`. Drizzle Kit generate/migrate is strictly NOT used to prevent schema divergence.
