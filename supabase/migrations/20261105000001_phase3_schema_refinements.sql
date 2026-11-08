-- ScrubX Pakistan: Phase 3 Schema Refinements & Enhancements
-- 1. Canonical Lowercase Role Normalization
-- 2. New Table: order_notes (Internal Order Comments)
-- 3. Product Categories ImageKit File ID Support
-- 4. UI Alignment Columns (is_featured, min_days, max_days, supports_proof)

-- ============================================================================
-- 1. ROLE NORMALIZATION (super_admin, admin, staff, customer)
-- ============================================================================

-- Drop the old mixed-case constraint FIRST so rows can be updated to lowercase
ALTER TABLE ba_user DROP CONSTRAINT IF EXISTS ba_user_role_check;

-- Migrate existing rows to lowercase
UPDATE ba_user SET role = lower(role);
UPDATE ba_user SET role = 'super_admin' WHERE role IN ('super_admin', 'superadmin');

-- Add new canonical lowercase constraint
ALTER TABLE ba_user ADD CONSTRAINT ba_user_role_check 
  CHECK (role IN ('super_admin', 'admin', 'staff', 'customer'));

ALTER TABLE ba_user ALTER COLUMN role SET DEFAULT 'staff';

-- ============================================================================
-- 2. NEW TABLE: order_notes
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (trim(body) <> ''),
  created_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON order_notes(order_id);

-- Enforce zero public access (server-only access)
ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. PRODUCT CATEGORIES: ImageKit File ID
-- ============================================================================

ALTER TABLE product_categories 
  ADD COLUMN IF NOT EXISTS image_file_id text;

-- ============================================================================
-- 4. UI ALIGNMENT COLUMNS
-- ============================================================================

-- Products: Featured Toggle (used in ProductForm.tsx & ProductView.tsx)
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Shipping Methods: Min / Max Delivery Window (used in Shipping.tsx)
ALTER TABLE shipping_methods 
  ADD COLUMN IF NOT EXISTS min_days integer,
  ADD COLUMN IF NOT EXISTS max_days integer;

-- Payment Methods: Proof Screenshot Upload Flag (used in PaymentMethods.tsx)
ALTER TABLE payment_methods 
  ADD COLUMN IF NOT EXISTS supports_proof boolean NOT NULL DEFAULT false;
