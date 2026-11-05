# ScrubX: Improved Database Schema (A to Z)

Stack: Supabase (Postgres) · Better Auth · ImageKit · Pakistan only (PKR)

**Legend:** PK = primary key · FK = foreign key · UQ = unique · `✓` = nullable · money columns are `numeric(12,2)` in PKR · every `created_at` / `updated_at` is `timestamptz` defaulting to `now()` (`updated_at` is maintained by a trigger).

---

## 0. Enums

| Enum | Values |
|---|---|
| `product_status` | `draft`, `active`, `archived` |
| `order_status` | `awaiting_payment`, `payment_submitted`, `pending` (COD only), `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded` |
| `payment_status` | `pending`, `awaiting_verification`, `paid`, `rejected`, `failed`, `refunded` |
| `discount_type` | `percentage`, `fixed_amount` |
| `engraving_type` | `name`, `logo` |

---

## 1. Authentication (Better Auth)

Generate these with the Better Auth CLI and map the table and column names in its config. Keep them as they are, plus the optional admin-plugin columns.

### `ba_user`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | text | no | | PK |
| `name` | text | no | | |
| `email` | text | no | | UQ |
| `email_verified` | boolean | no | `false` | |
| `image` | text | yes | | |
| `role` | text | no | `'customer'` | CHECK in (`admin`, `customer`) |
| `banned` | boolean | yes | `false` | Optional, only for the admin plugin |
| `ban_reason` | text | yes | | Optional, admin plugin |
| `ban_expires` | timestamptz | yes | | Optional, admin plugin |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

### `ba_session`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | text | no | | PK |
| `user_id` | text | no | | FK → `ba_user.id` (cascade delete), **indexed** |
| `token` | text | no | | UQ |
| `expires_at` | timestamptz | no | | |
| `ip_address` | text | yes | | |
| `user_agent` | text | yes | | |
| `impersonated_by` | text | yes | | Optional, admin plugin |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

### `ba_account`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | text | no | | PK |
| `account_id` | text | no | | |
| `provider_id` | text | no | | |
| `user_id` | text | no | | FK → `ba_user.id` (cascade delete), **indexed** |
| `access_token`, `refresh_token`, `id_token` | text | yes | | |
| `access_token_expires_at`, `refresh_token_expires_at` | timestamptz | yes | | |
| `scope` | text | yes | | |
| `password` | text | yes | | Hashed by Better Auth |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

### `ba_verification`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | text | no | | PK |
| `identifier` | text | no | | |
| `value` | text | no | | |
| `expires_at` | timestamptz | no | | |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

---

## 2. Catalog

### `product_categories`
Supports hierarchy, e.g. Scrubs → Tops, Pants; Lab Coats; Accessories → Stethoscopes.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `parent_id` | uuid | yes | | **New.** FK → `product_categories.id` |
| `name` | text | no | | UQ |
| `slug` | text | no | | UQ |
| `description` | text | yes | | |
| `image_url` | text | yes | | **New.** |
| `sort_order` | integer | no | `0` | **New.** |
| `is_active` | boolean | no | `true` | |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

### `products`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `name` | text | no | | |
| `slug` | text | no | | UQ |
| `description` | text | yes | | |
| `status` | `product_status` | no | `'draft'` | |
| `category_id` | uuid | yes | | FK → `product_categories.id`, indexed |
| `brand` | text | yes | | |
| `gender` | text | yes | | **New.** CHECK in (`men`, `women`, `unisex`) |
| `material` | text | yes | | **New.** e.g. "Poly-cotton" |
| `is_engravable` | boolean | no | `false` | **New.** Only these products show engraving options |
| `deleted_at` | timestamptz | yes | | Soft delete |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

**Removed:** `category` (text) and `image_url`. Use `category_id` and `product_images`.

### `product_colors` (new)
The color swatches for a product. Images and variants point here.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `product_id` | uuid | no | | FK → `products.id` (cascade delete), indexed |
| `name` | text | no | | e.g. "Navy Blue" |
| `hex_code` | text | yes | | CHECK format `#RRGGBB`, used for the swatch |
| `sort_order` | integer | no | `0` | |
| `created_at` | timestamptz | no | `now()` | |

Unique: (`product_id`, `name`)

### `product_variants`
One row per color and size combination. The price lives here, so each size can have its own price.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `product_id` | uuid | no | | FK → `products.id`, indexed |
| `color_id` | uuid | yes | | **New.** FK → `product_colors.id`, indexed |
| `sku` | text | no | | UQ |
| `name` | text | no | | e.g. "Navy Blue / M" |
| `size` | text | yes | | XS, S, M, L, XL, 2XL |
| `size_sort_order` | integer | no | `0` | **New.** Correct ordering of sizes |
| `price` | numeric(12,2) | no | | **New.** CHECK ≥ 0. This size's price |
| `compare_at_price` | numeric(12,2) | yes | | **New.** Strike-through "was" price |
| `attributes` | jsonb | no | `'{}'` | Extra attributes |
| `is_active` | boolean | no | `true` | |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Unique: (`product_id`, `color_id`, `size`) so there are no duplicate combinations.
**Removed:** the free-text `color` column. The separate `variant_prices` table is dropped (see the notes at the end).

### `product_images`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `product_id` | uuid | no | | FK → `products.id` (cascade delete) |
| `color_id` | uuid | yes | | **New.** FK → `product_colors.id` (cascade delete). `NULL` = shown for all colors |
| `imagekit_file_id` | text | no | | UQ, needed to delete the file in ImageKit |
| `url` | text | no | | |
| `thumbnail_url` | text | yes | | |
| `alt_text` | text | yes | | |
| `sort_order` | integer | no | `0` | CHECK ≥ 0. `0` = main image |
| `created_at` | timestamptz | no | `now()` | |

Index: (`product_id`, `color_id`, `sort_order`)

---

## 3. Inventory

### `inventory`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `variant_id` | uuid | no | | FK → `product_variants.id`, UQ (one row per variant) |
| `quantity_on_hand` | integer | no | `0` | CHECK ≥ 0 |
| `quantity_reserved` | integer | no | `0` | CHECK ≥ 0 **and** ≤ `quantity_on_hand` |
| `reorder_level` | integer | no | `5` | CHECK ≥ 0 |
| `updated_at` | timestamptz | no | `now()` | |

Available stock = `quantity_on_hand − quantity_reserved`.

### `inventory_movements` (new)
An audit log of every stock change.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `variant_id` | uuid | no | | FK → `product_variants.id`, indexed |
| `change` | integer | no | | Positive or negative |
| `reason` | text | no | | `restock`, `sale`, `cancel`, `adjustment`, `return` |
| `order_id` | uuid | yes | | FK → `orders.id` |
| `created_by` | text | yes | | `ba_user.id` of the admin |
| `created_at` | timestamptz | no | `now()` | |

---

## 4. Engraving

### `engraving_options`
Two rows: **Name Engraving** and **Logo Engraving**.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `type` | `engraving_type` | no | `'name'` | **New.** Tells the UI whether to show a text box or a file upload |
| `name` | text | no | | |
| `description` | text | yes | | |
| `price` | numeric(12,2) | no | `0` | CHECK ≥ 0. Extra price **per unit** |
| `max_characters` | integer | yes | | CHECK > 0. Used for name engraving; `NULL` for logo |
| `is_active` | boolean | no | `true` | |
| `created_at` | timestamptz | no | `now()` | |

The "can this product be engraved?" flag is `products.is_engravable`.

---

## 5. Customers and Addresses

### `customers`
Works for both registered users and guest checkout.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `user_id` | text | yes | | **Changed.** FK → `ba_user.id` (set null on delete), UQ. Was `auth_user_id` pointing at Supabase `auth.users` |
| `email` | text | no | | Unique (case-insensitive) for registered customers |
| `first_name`, `last_name` | text | yes | | |
| `phone` | text | yes | | |
| `notes` | text | yes | | Internal admin notes |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

**Removed:** the `shipping_address` and `billing_address` JSON columns (replaced by `addresses`). Billing address isn't needed for a Pakistan store.

### `addresses` (new)
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `customer_id` | uuid | no | | FK → `customers.id` (cascade delete), indexed |
| `label` | text | yes | | "Home", "Hospital" |
| `full_name` | text | no | | |
| `phone` | text | no | | Required by couriers |
| `address_line1` | text | no | | |
| `address_line2` | text | yes | | |
| `city` | text | no | | |
| `province` | text | yes | | |
| `postal_code` | text | yes | | |
| `country` | text | no | `'PK'` | |
| `is_default` | boolean | no | `false` | At most one default per customer |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

---

## 6. Shipping

### `shipping_methods`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `name` | text | no | | e.g. "Standard (TCS)" |
| `description` | text | yes | | |
| `price` | numeric(12,2) | no | `0` | CHECK ≥ 0 |
| `free_above` | numeric(12,2) | yes | | Free shipping above this subtotal |
| `estimated_days` | integer | yes | | CHECK ≥ 0 |
| `is_active` | boolean | no | `true` | |
| `sort_order` | integer | no | `0` | |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

---

## 7. Coupons

### `coupons`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `code` | text | no | | Unique, case-insensitive |
| `description` | text | yes | | |
| `discount_type` | `discount_type` | no | | |
| `discount_value` | numeric | no | | CHECK > 0, and ≤ 100 when type is `percentage` |
| `minimum_order_amount` | numeric(12,2) | no | `0` | CHECK ≥ 0 |
| `maximum_discount_amount` | numeric(12,2) | yes | | CHECK > 0, caps percentage discounts |
| `usage_limit` | integer | yes | | CHECK > 0, total redemptions |
| `usage_limit_per_customer` | integer | yes | | **New.** CHECK > 0 |
| `usage_count` | integer | no | `0` | CHECK ≥ 0. Increment atomically |
| `first_order_only` | boolean | no | `false` | **New.** |
| `starts_at` | timestamptz | no | `now()` | |
| `expires_at` | timestamptz | yes | | CHECK > `starts_at` |
| `is_active` | boolean | no | `true` | |
| `created_at` | timestamptz | no | `now()` | |

---

## 8. Payment Methods (admin-editable)

### `payment_methods` (new)
Shown at checkout and used to enforce "no COD with engraving".

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `code` | text | no | | UQ: `jazzcash`, `easypaisa`, `sadapay`, `nayapay`, `bank_transfer`, `cod` |
| `name` | text | no | | Display name |
| `type` | text | no | | CHECK in (`wallet`, `bank_transfer`, `cod`) |
| `account_title` | text | yes | | Name shown to the customer |
| `account_number` | text | yes | | Wallet number or bank account number |
| `bank_name` | text | yes | | |
| `iban` | text | yes | | |
| `instructions` | text | yes | | e.g. "Send the screenshot on WhatsApp with your order number" |
| `allowed_with_engraving` | boolean | no | `true` | **`false` for COD** |
| `is_active` | boolean | no | `true` | |
| `sort_order` | integer | no | `0` | |
| `created_at` | timestamptz | no | `now()` | |

---

## 9. Orders

### `orders`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `order_number` | text | no | `'SX-' + sequence` | UQ, e.g. `SX-1001`. Customers quote it on WhatsApp |
| `customer_id` | uuid | no | | FK → `customers.id`, indexed |
| `status` | `order_status` | no | `'awaiting_payment'` | |
| `currency` | text | no | `'PKR'` | CHECK length = 3 |
| `subtotal` | numeric(12,2) | no | `0` | Sum of item `line_total` values |
| `engraving_total` | numeric(12,2) | no | `0` | **New.** Sum of engraving prices × quantity |
| `discount_total` | numeric(12,2) | no | `0` | CHECK ≥ 0 |
| `shipping_total` | numeric(12,2) | no | `0` | CHECK ≥ 0 |
| `tax_total` | numeric(12,2) | no | `0` | CHECK ≥ 0 |
| `total` | numeric(12,2) | no | `0` | CHECK = subtotal + engraving_total − discount_total + shipping_total + tax_total |
| `has_engraving` | boolean | no | `false` | **New.** Set automatically when engraving is added |
| `payment_method_id` | uuid | yes | | **New.** FK → `payment_methods.id`. A trigger rejects methods with `allowed_with_engraving = false` when `has_engraving` is true |
| `shipping_method_id` | uuid | yes | | **New.** FK → `shipping_methods.id` |
| `shipping_method_name` | text | yes | | **New.** Snapshot at order time |
| `contact_phone` | text | yes | | **New.** |
| `shipping_address` | jsonb | no | `'{}'` | Snapshot copy of the address at order time |
| `notes` | text | yes | | Customer note |
| `courier` | text | yes | | **New.** |
| `tracking_number` | text | yes | | **New.** |
| `payment_due_at` | timestamptz | yes | | **New.** Unpaid orders auto-cancel after this and release reserved stock |
| `placed_at` | timestamptz | no | `now()` | |
| `shipped_at`, `delivered_at`, `cancelled_at` | timestamptz | yes | | **New.** |
| `idempotency_key` | text | yes | | **Now unique** (where not null), prevents double-submitted orders |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Indexes: (`customer_id`), (`status`, `placed_at` desc)
**Removed:** `billing_address`.

### `order_items`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `order_id` | uuid | no | | FK → `orders.id` (cascade delete), indexed |
| `variant_id` | uuid | no | | FK → `product_variants.id` |
| `sku` | text | no | | Snapshot |
| `product_name` | text | no | | Snapshot |
| `variant_name` | text | no | | Snapshot, e.g. "Navy Blue / M" |
| `image_url` | text | yes | | **New.** Snapshot of the color-correct image |
| `unit_price` | numeric(12,2) | no | | CHECK ≥ 0. Snapshot of the variant price |
| `quantity` | integer | no | | CHECK > 0 |
| `line_total` | numeric(12,2) | no | | **Fixed.** Generated column: `unit_price × quantity` (was only a default) |
| `created_at` | timestamptz | no | `now()` | |

### `order_item_engraving`
At most one row per engraving type on an order item.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `order_item_id` | uuid | no | | FK → `order_items.id` (cascade delete), indexed |
| `engraving_option_id` | uuid | no | | FK → `engraving_options.id` |
| `text` | text | yes | | **Now nullable.** The name to engrave (name type) |
| `logo_url` | text | yes | | **New.** Uploaded logo (logo type), private ImageKit folder |
| `logo_imagekit_file_id` | text | yes | | **New.** |
| `placement` | text | yes | | **New.** e.g. "Left chest" |
| `price` | numeric(12,2) | no | | CHECK ≥ 0. Snapshot, **per unit** |
| `created_at` | timestamptz | no | `now()` | |

Constraints: UQ (`order_item_id`, `engraving_option_id`). CHECK that either `text` is non-empty or `logo_url` is present.

### `order_coupons`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `order_id` | uuid | no | | PK (part 1), FK → `orders.id` (cascade delete) |
| `coupon_id` | uuid | no | | PK (part 2), FK → `coupons.id` |
| `discount_amount` | numeric(12,2) | no | | CHECK ≥ 0 |
| `created_at` | timestamptz | no | `now()` | |

### `order_status_history`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `order_id` | uuid | no | | FK → `orders.id` (cascade delete), indexed |
| `from_status` | `order_status` | yes | | |
| `to_status` | `order_status` | no | | |
| `note` | text | yes | | |
| `changed_by` | text | yes | | `ba_user.id` or `'system'` |
| `created_at` | timestamptz | no | `now()` | |

### `payments`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `order_id` | uuid | no | | FK → `orders.id`, indexed |
| `payment_method_id` | uuid | no | | **New.** FK → `payment_methods.id` (replaces the `provider` enum) |
| `status` | `payment_status` | no | `'pending'` | Indexed |
| `amount` | numeric(12,2) | no | | CHECK ≥ 0 |
| `currency` | text | no | `'PKR'` | CHECK length = 3 |
| `sender_name` | text | yes | | **New.** Name on the sending account |
| `sender_account_last4` | text | yes | | **New.** |
| `transaction_reference` | text | yes | | **New.** TID from the wallet or bank app |
| `proof_url` | text | yes | | **New.** Optional, if you also accept uploaded screenshots |
| `provider_payment_id` | text | yes | | For future automatic gateways |
| `metadata` | jsonb | no | `'{}'` | |
| `verified_by` | text | yes | | **New.** FK → `ba_user.id` (admin who confirmed) |
| `verified_at` | timestamptz | yes | | **New.** |
| `rejection_reason` | text | yes | | **New.** |
| `paid_at` | timestamptz | yes | | |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

---

## 10. Store Settings

### `store_settings`
Key-value config. Never store secrets here.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `key` | text | no | | PK. e.g. `whatsapp_number`, `store_name`, `payment_deadline_hours`, `support_email` |
| `value` | jsonb | no | `'{}'` | |
| `updated_at` | timestamptz | no | `now()` | |
| `updated_by` | text | yes | | `ba_user.id` |

---

## 11. Phase 2 (optional, add after launch)

### `product_reviews`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `product_id` | uuid | no | FK → `products.id`, indexed |
| `customer_id` | uuid | no | FK → `customers.id` |
| `order_item_id` | uuid | yes | FK → `order_items.id` (verified purchase) |
| `rating` | smallint | no | CHECK 1 to 5 |
| `title`, `body` | text | yes | |
| `is_approved` | boolean | no | Default `false`, moderated by admin |
| `created_at` | timestamptz | no | |

Unique: (`product_id`, `customer_id`)

### `wishlist_items`
| Column | Type | Null | Notes |
|---|---|---|---|
| `customer_id` | uuid | no | PK part 1, FK → `customers.id` |
| `product_id` | uuid | no | PK part 2, FK → `products.id` |
| `created_at` | timestamptz | no | |

### `return_requests`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `order_item_id` | uuid | no | FK → `order_items.id` |
| `reason` | text | no | |
| `status` | text | no | `requested`, `approved`, `rejected`, `received`, `refunded` |
| `refund_amount` | numeric(12,2) | yes | |
| `created_at` / `updated_at` | timestamptz | no | |

Items with engraving are custom-made, so block these at the application level.

### `size_guides`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `category_id` | uuid | yes | FK → `product_categories.id` |
| `name` | text | no | |
| `chart` | jsonb | no | Measurements per size |

---

## 12. Relationships at a Glance

```
product_categories (self-parent) ──< products ──< product_colors
                                        │              │
                                        ├──< product_images (color_id optional)
                                        └──< product_variants >── product_colors
                                                   ├── inventory (1:1) ──< inventory_movements
                                                   └──< order_items

ba_user ──< ba_session / ba_account
   └── customers (0..1) ──< addresses
                  └──< orders ──< order_items ──< order_item_engraving >── engraving_options
                          ├──< payments >── payment_methods
                          ├──< order_coupons >── coupons
                          ├──< order_status_history
                          ├──> shipping_methods
                          └──> payment_methods (checked against has_engraving)
```

## 13. Business Rules Enforced by the Schema

| Rule | Where it's enforced |
|---|---|
| Changing the color changes the images | `product_images.color_id` (plus `NULL` for shared images) |
| Each size has its own price | `product_variants.price` |
| Engraving is name, logo, both or none | `order_item_engraving` rows (0 to 2 per item, unique per type) |
| Engraving has an extra price | `engraving_options.price`, snapshotted into `order_item_engraving.price` |
| Engraved orders can't use COD | `payment_methods.allowed_with_engraving` + trigger on `orders` |
| Pakistani providers only | Rows in `payment_methods` (JazzCash, Easypaisa, SadaPay, NayaPay, bank transfer) |
| Payment confirmed manually after a WhatsApp screenshot | `payments.status` moves `awaiting_verification` → `paid` / `rejected`, with `verified_by` and `verified_at` |
| WhatsApp number | `store_settings` key `whatsapp_number` |
| No negative or oversold stock | `inventory` CHECK constraints and atomic decrement |
| Price changes don't alter old orders | Snapshot columns on `order_items`, `order_item_engraving`, `orders` |

## 14. Security Notes

- Enable **Row Level Security on every table with no policies**, and access the database only from your server (service role key or direct connection). Never expose the Supabase anon key to these tables.
- Store customer logos in a **private** ImageKit folder.
- Keep payment account details for display only; never store customer card or wallet PINs.
