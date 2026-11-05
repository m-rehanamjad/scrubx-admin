---
name: supabase-postgres
description: >-
  Enforce PostgreSQL database best practices for Supabase, strictly using Supabase
  as a managed Postgres database layer (no Supabase Auth or Storage) with Drizzle ORM,
  strict foreign keys, indexes, check constraints, and atomic transactions.
---

# Supabase PostgreSQL & Database Design Skill

This skill governs the database layer for ScrubX, using **Supabase strictly as a managed PostgreSQL instance** paired with **Drizzle ORM**.

---

## 1. Architectural Guardrails

1. **Strictly Postgres**: Do NOT use Supabase Auth (`@supabase/auth-helpers`, `@supabase/supabase-js` auth methods) or Supabase Storage. Authentication is handled by **Better Auth**, and media storage is handled by **ImageKit**.
2. **Direct Connection Pooling**: Connect to Supabase Postgres using `postgres` or `pg` with Transaction/Session pooling (`SUPABASE_DATABASE_URL` with PgBouncer / Supavisor on port 6543 or 5432).
3. **Zero Public Client Access**: Never expose Supabase anon keys to frontend browser clients for direct database access. All queries and mutations occur inside **Next.js Server Components, Server Actions, or Route Handlers**.
4. **Row Level Security (RLS)**: Enable RLS on every table without open policies:
   ```sql
   ALTER TABLE products ENABLE ROW LEVEL SECURITY;
   -- No public policies! Server connects via privileged database credentials.
   ```

---

## 2. Database Design & Relational Modeling Best Practices

### A. Strict Foreign Keys & Delete Behaviors
- **Cascade Deletes**: Child entities that have no reason to exist without their parent MUST specify `ON DELETE CASCADE`:
  - `product_colors` $\to$ `products(id)`
  - `product_images` $\to$ `products(id)`
  - `order_items` $\to$ `orders(id)`
  - `order_item_engraving` $\to$ `order_items(id)`
- **Restrict Deletes**: Master or transactional data must never accidentally vanish:
  - `orders.customer_id` $\to$ `customers(id)` ON DELETE RESTRICT
  - `order_items.variant_id` $\to$ `product_variants(id)` ON DELETE RESTRICT
- **Set Null**: Optional associations where data remains historically valid:
  - `customers.user_id` $\to$ `ba_user(id)` ON DELETE SET NULL

### B. Strategic Indexing
Always index:
1. Every foreign key column (`customer_id`, `product_id`, `variant_id`, `category_id`).
2. High-frequency filter and sort columns:
   - `orders (status, placed_at DESC)` (Compound index for dashboard and order queue)
   - `products (status)`
   - `product_variants (product_id, color_id)`
   - `product_images (product_id, color_id, sort_order)`
3. Unique constraints for natural identifiers:
   - `products.slug`
   - `product_categories.slug`
   - `product_variants.sku`
   - `coupons.code` (Case-insensitive)
   - `orders.order_number`

### C. Check Constraints & Data Integrity
Enforce domain rules at the schema level, not only in TypeScript:
- **Currency & Money**: Money columns must be `numeric(12,2)` with `CHECK (amount >= 0)`.
- **Order Total Integrity**: `CHECK (total = subtotal + engraving_total - discount_total + shipping_total + tax_total)`.
- **Inventory Bounds**: `CHECK (quantity_on_hand >= 0)` and `CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand)`.
- **Hex Colors**: `CHECK (hex_code ~* '^#[0-9A-F]{6}$')`.
- **Enums**: Leverage Postgres native ENUM types for state machines (`order_status`, `payment_status`, `product_status`, `engraving_type`).

### D. Snapshot Columns for Historical Immutability
Past orders must NEVER change when catalog prices or product descriptions change:
- `order_items` stores snapshots of `sku`, `product_name`, `variant_name`, `image_url`, and `unit_price`.
- `order_item_engraving` stores snapshot of `price`.
- `orders.shipping_address` stores an immutable JSONB snapshot of the delivery address at checkout.

---

## 3. Concurrency & Atomic Operations

Prevent race conditions (e.g. inventory overselling, coupon redemption limits) using atomic SQL operations:

### Atomic Stock Reservation:
```typescript
// Atomically deduct stock only if sufficient stock exists
const result = await db.execute(sql`
  UPDATE inventory
  SET quantity_on_hand = quantity_on_hand - ${qty},
      updated_at = now()
  WHERE variant_id = ${variantId}
    AND quantity_on_hand >= ${qty}
  RETURNING quantity_on_hand;
`);

if (result.rowCount === 0) {
  throw new Error("Insufficient stock available");
}
```

### Atomic Coupon Usage Increment:
```typescript
const result = await db.execute(sql`
  UPDATE coupons
  SET usage_count = usage_count + 1
  WHERE id = ${couponId}
    AND (usage_limit IS NULL OR usage_count < usage_limit)
    AND is_active = true
  RETURNING id;
`);
```

---

## 4. Database Trigger Automations

### 1. Auto-updating `updated_at`:
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2. Auto-generated Sequential Order Numbers:
```sql
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number = 'SX-' || nextval('order_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 3. Business Rule: Prohibit Cash on Delivery for Engraved Orders:
```sql
CREATE OR REPLACE FUNCTION check_engraving_cod_rule()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF NEW.has_engraving = true AND NEW.payment_method_id IS NOT NULL THEN
    SELECT allowed_with_engraving INTO v_allowed
    FROM payment_methods
    WHERE id = NEW.payment_method_id;

    IF v_allowed = false THEN
      RAISE EXCEPTION 'Custom engraved orders cannot be placed with Cash on Delivery.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Drizzle ORM Project Standards

- **Schema Definition**: Place schemas in `src/db/schema.ts` (exporting tables, enums, relations, and type inference).
- **Client Instance**: `src/db/index.ts` initializes connection pool with `postgres`:
  ```typescript
  import { drizzle } from "drizzle-orm/postgres-js";
  import postgres from "postgres";
  import * as schema from "./schema";

  const connectionString = process.env.DATABASE_URL!;
  const client = postgres(connectionString, { max: 10 });
  export const db = drizzle(client, { schema });
  ```
- **Type Safety**: Always export inferred types:
  ```typescript
  export type Product = typeof products.$inferSelect;
  export type NewProduct = typeof products.$inferInsert;
  ```
