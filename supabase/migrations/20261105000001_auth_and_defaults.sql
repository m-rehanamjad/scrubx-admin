-- Shared auth throttling across serverless instances; not Supabase Auth.
CREATE TABLE ba_rate_limit (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL DEFAULT 0,
  last_request bigint NOT NULL
);
ALTER TABLE ba_rate_limit ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ba_verification_identifier ON ba_verification(identifier);
CREATE UNIQUE INDEX uq_ba_account_provider ON ba_account(provider_id, account_id);

-- Checkout configuration only: disabled until the owner provides real account details.
INSERT INTO payment_methods (code, name, type, allowed_with_engraving, is_active, sort_order) VALUES
 ('jazzcash', 'JazzCash', 'wallet', true, false, 1),
 ('easypaisa', 'Easypaisa', 'wallet', true, false, 2),
 ('sadapay', 'SadaPay', 'wallet', true, false, 3),
 ('nayapay', 'NayaPay', 'wallet', true, false, 4),
 ('bank', 'Bank transfer', 'bank_transfer', true, false, 5),
 ('cod', 'Cash on delivery', 'cod', false, false, 6)
ON CONFLICT (code) DO NOTHING;
ALTER TABLE payment_methods ADD CONSTRAINT chk_cod_no_engraving CHECK (type <> 'cod' OR NOT allowed_with_engraving);

-- Match the mandatory references specified by database.md.
ALTER TABLE order_items ALTER COLUMN variant_id SET NOT NULL;
ALTER TABLE order_item_engraving ALTER COLUMN engraving_option_id SET NOT NULL;
