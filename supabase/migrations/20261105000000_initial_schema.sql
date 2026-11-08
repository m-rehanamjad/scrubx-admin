-- ScrubX Pakistan: Initial Production Database Schema
-- Stack: Supabase (PostgreSQL) + Better Auth + ImageKit
-- Currency: PKR (numeric(12,2))

-- ============================================================================
-- 0. EXTENSIONS & HELPER FUNCTIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to maintain updated_at on records automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sequence for human-readable order numbers (e.g. SX-1001)
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number = 'SX-' || nextval('order_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE order_status AS ENUM (
  'awaiting_payment',
  'payment_submitted',
  'pending', -- COD only
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
);
CREATE TYPE payment_status AS ENUM (
  'pending',
  'awaiting_verification',
  'paid',
  'rejected',
  'failed',
  'refunded'
);
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE engraving_type AS ENUM ('name', 'logo');

-- ============================================================================
-- 2. BETTER AUTH TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS ba_user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  role text NOT NULL DEFAULT 'STAFF' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'admin', 'customer')),
  banned boolean DEFAULT false,
  ban_reason text,
  ban_expires timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ba_user_updated_at
  BEFORE UPDATE ON ba_user
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS ba_session (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  impersonated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ba_session_user_id ON ba_session(user_id);

CREATE TABLE IF NOT EXISTS ba_account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ba_account_user_id ON ba_account(user_id);

CREATE TABLE IF NOT EXISTS ba_verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  status product_status NOT NULL DEFAULT 'draft',
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  brand text,
  gender text CHECK (gender IN ('men', 'women', 'unisex')),
  material text,
  is_engravable boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS product_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  hex_code text CHECK (hex_code ~* '^#[0-9A-F]{6}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_colors_product_id ON product_colors(product_id);

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_id uuid REFERENCES product_colors(id) ON DELETE SET NULL,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  size text,
  size_sort_order integer NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  compare_at_price numeric(12,2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  attributes jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, color_id, size)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_color_id ON product_variants(color_id);

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_id uuid REFERENCES product_colors(id) ON DELETE CASCADE,
  imagekit_file_id text NOT NULL UNIQUE,
  url text NOT NULL,
  thumbnail_url text,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_lookup ON product_images(product_id, color_id, sort_order);

-- ============================================================================
-- 4. INVENTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved integer NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand),
  reorder_level integer NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. ENGRAVING OPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS engraving_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type engraving_type NOT NULL DEFAULT 'name',
  name text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  max_characters integer CHECK (max_characters IS NULL OR max_characters > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. CUSTOMERS & ADDRESSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE REFERENCES ba_user(id) ON DELETE SET NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text,
  full_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  province text,
  postal_code text,
  country text NOT NULL DEFAULT 'PK',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);

CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. SHIPPING METHODS
-- ============================================================================

CREATE TABLE IF NOT EXISTS shipping_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  free_above numeric(12,2) CHECK (free_above IS NULL OR free_above >= 0),
  estimated_days integer CHECK (estimated_days IS NULL OR estimated_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_shipping_methods_updated_at
  BEFORE UPDATE ON shipping_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. COUPONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type discount_type NOT NULL,
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  minimum_order_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_order_amount >= 0),
  maximum_discount_amount numeric(12,2) CHECK (maximum_discount_amount IS NULL OR maximum_discount_amount > 0),
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_limit_per_customer integer CHECK (usage_limit_per_customer IS NULL OR usage_limit_per_customer > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  first_order_only boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz CHECK (expires_at IS NULL OR expires_at > starts_at),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_coupon_pct CHECK (discount_type != 'percentage' OR discount_value <= 100)
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(lower(code));

-- ============================================================================
-- 9. PAYMENT METHODS
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('wallet', 'bank_transfer', 'cod')),
  account_title text,
  account_number text,
  bank_name text,
  iban text,
  instructions text,
  allowed_with_engraving boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'awaiting_payment',
  currency text NOT NULL DEFAULT 'PKR' CHECK (length(currency) = 3),
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  engraving_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (engraving_total >= 0),
  discount_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  shipping_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  tax_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  has_engraving boolean NOT NULL DEFAULT false,
  payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  shipping_method_id uuid REFERENCES shipping_methods(id) ON DELETE SET NULL,
  shipping_method_name text,
  contact_phone text,
  shipping_address jsonb NOT NULL DEFAULT '{}',
  notes text,
  courier text,
  tracking_number text,
  payment_due_at timestamptz,
  placed_at timestamptz NOT NULL DEFAULT now(),
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_order_total CHECK (total = subtotal + engraving_total - discount_total + shipping_total + tax_total)
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_placed_at ON orders(status, placed_at DESC);

CREATE TRIGGER trg_orders_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Business Rule Trigger: Prohibit COD with Engraved Orders
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

CREATE TRIGGER trg_check_engraving_cod
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION check_engraving_cod_rule();

-- ============================================================================
-- 11. ORDER LINE ITEMS & ENGRAVING
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  product_name text NOT NULL,
  variant_name text NOT NULL,
  image_url text,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_item_engraving (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  engraving_option_id uuid REFERENCES engraving_options(id) ON DELETE RESTRICT,
  text text,
  logo_url text,
  logo_imagekit_file_id text,
  placement text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, engraving_option_id),
  CONSTRAINT chk_engraving_content CHECK (
    (text IS NOT NULL AND trim(text) <> '') OR (logo_url IS NOT NULL AND trim(logo_url) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_order_item_engraving_item ON order_item_engraving(order_item_id);

CREATE TABLE IF NOT EXISTS order_coupons (
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, coupon_id)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  note text,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);

-- ============================================================================
-- 12. PAYMENTS & VERIFICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_method_id uuid NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  status payment_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'PKR' CHECK (length(currency) = 3),
  sender_name text,
  sender_account_last4 text,
  transaction_reference text,
  proof_url text,
  provider_payment_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  verified_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  verified_at timestamptz,
  rejection_reason text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 13. INVENTORY MOVEMENTS AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  change integer NOT NULL,
  reason text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON inventory_movements(variant_id);

-- ============================================================================
-- 14. STORE SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES ba_user(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_store_settings_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 15. ROW LEVEL SECURITY (RLS) LOCKDOWN
-- ============================================================================
-- Enforce zero direct public access. Server connections bypass RLS via privileged credentials.

ALTER TABLE ba_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE ba_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE ba_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE ba_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE engraving_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_engraving ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
