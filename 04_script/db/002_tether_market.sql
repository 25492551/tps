-- 002_tether_market.sql — Tether Market core schema (UTC timestamptz)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  status text NOT NULL CHECK (status IN ('pending_approval', 'active', 'suspended', 'deleted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  is_custody boolean NOT NULL DEFAULT false,
  bank_code text NOT NULL,
  bank_name text NOT NULL DEFAULT '',
  account_no text NOT NULL,
  holder_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'disabled')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (is_custody = true AND user_id IS NULL)
    OR (is_custody = false AND user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS tether_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  is_custody boolean NOT NULL DEFAULT false,
  chain text NOT NULL DEFAULT 'TRC-20' CHECK (chain = 'TRC-20'),
  address text NOT NULL,
  label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (is_custody = true AND user_id IS NULL)
    OR (is_custody = false AND user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('buy', 'sell')),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  price_krw_per_usdt numeric(20, 2) NOT NULL CHECK (price_krw_per_usdt > 0),
  amount_usdt numeric(20, 6) NOT NULL CHECK (amount_usdt > 0),
  min_usdt numeric(20, 6),
  max_usdt numeric(20, 6),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'matched', 'closed', 'hidden')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  buyer_user_id uuid NOT NULL REFERENCES users(id),
  seller_user_id uuid NOT NULL REFERENCES users(id),
  amount_usdt numeric(20, 6) NOT NULL CHECK (amount_usdt > 0),
  amount_krw numeric(20, 2) NOT NULL CHECK (amount_krw > 0),
  status text NOT NULL DEFAULT 'awaiting_dual_deposit'
    CHECK (status IN (
      'awaiting_dual_deposit',
      'krw_confirmed',
      'usdt_confirmed',
      'both_held',
      'completed',
      'cancelled',
      'disputed'
    )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_user_id <> seller_user_id)
);

CREATE TABLE IF NOT EXISTS deposit_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('buyer_krw', 'seller_usdt')),
  expected_amount numeric(20, 6) NOT NULL,
  tx_ref text NOT NULL DEFAULT '',
  proof_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'awaiting'
    CHECK (status IN ('awaiting', 'received', 'rejected')),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, side)
);

CREATE TABLE IF NOT EXISTS holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  asset text NOT NULL CHECK (asset IN ('krw', 'usdt')),
  amount numeric(20, 6) NOT NULL CHECK (amount > 0),
  depositor_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'exchanged', 'refunded', 'cancelled')),
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, asset)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  asset text NOT NULL CHECK (asset IN ('krw', 'usdt')),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount numeric(20, 6) NOT NULL CHECK (amount > 0),
  balance_after numeric(20, 6) NOT NULL,
  ref_type text NOT NULL DEFAULT '',
  ref_id uuid,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON ledger_entries(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  asset text NOT NULL CHECK (asset IN ('krw', 'usdt')),
  amount numeric(20, 6) NOT NULL CHECK (amount > 0),
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'rejected')),
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_trade_created ON chat_messages(trade_id, created_at);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (id) VALUES ('002_tether_market') ON CONFLICT DO NOTHING;
