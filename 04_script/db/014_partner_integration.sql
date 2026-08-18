-- 014_partner_integration.sql — partner SSO, member map, credit intents

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  api_key_hash text NOT NULL,
  callback_base_url text NOT NULL DEFAULT '',
  callback_path text NOT NULL DEFAULT '/api/integrations/tps/credit-game',
  callback_secret text NOT NULL DEFAULT '',
  virtual_deposit_address text NOT NULL,
  usdt_to_game_rate numeric(20, 8) NOT NULL DEFAULT 1 CHECK (usdt_to_game_rate > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS partners_virtual_address_uidx
  ON partners (virtual_deposit_address);

CREATE TABLE IF NOT EXISTS partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_login_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, external_user_id),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS partner_members_external_idx
  ON partner_members (partner_id, external_login_id);

CREATE TABLE IF NOT EXISTS partner_credit_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  partner_member_id uuid NOT NULL REFERENCES partner_members(id),
  user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  amount_usdt numeric(20, 6) NOT NULL CHECK (amount_usdt > 0),
  game_amount numeric(20, 2) NOT NULL CHECK (game_amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  partner_receipt text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS partner_credit_intents_user_idx
  ON partner_credit_intents (user_id, created_at DESC);

COMMENT ON TABLE partners IS 'External solutions that consume TPS partner API';
COMMENT ON COLUMN partners.virtual_deposit_address IS
  'UI-only fake TRC-20 address; transfers here debit ledger and credit partner game money';
COMMENT ON TABLE partner_members IS 'Maps partner external user id to TPS users';
COMMENT ON TABLE partner_credit_intents IS 'Idempotent USDT→partner game-money credit attempts';
