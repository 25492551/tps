-- 012_admin_custody_wallets.sql — admin custody wallet ops + internal transfers

-- One default OTC deposit wallet among custody wallets
CREATE UNIQUE INDEX IF NOT EXISTS tether_wallets_custody_default_uidx
  ON tether_wallets (is_default)
  WHERE is_custody = true AND is_default = true;

CREATE UNIQUE INDEX IF NOT EXISTS tether_wallets_custody_address_uidx
  ON tether_wallets (address)
  WHERE is_custody = true;

-- Promote existing custody row to default if none
UPDATE tether_wallets w
SET is_default = true
WHERE w.is_custody = true
  AND w.id = (
    SELECT id FROM tether_wallets
    WHERE is_custody = true
    ORDER BY created_at ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM tether_wallets WHERE is_custody = true AND is_default = true
  );

CREATE TABLE IF NOT EXISTS custody_wallet_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wallet_id uuid NOT NULL REFERENCES tether_wallets(id),
  to_wallet_id uuid NOT NULL REFERENCES tether_wallets(id),
  amount_usdt numeric(20, 6) NOT NULL CHECK (amount_usdt > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (from_wallet_id <> to_wallet_id)
);

CREATE INDEX IF NOT EXISTS custody_wallet_transfers_created_idx
  ON custody_wallet_transfers (created_at DESC);

COMMENT ON TABLE custody_wallet_transfers IS
  'Admin ops log for moving USDT between custody wallets (on-chain send is manual; mark completed when done)';
