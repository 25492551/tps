-- 021_agent_partner_tree.sql — partner parent tree + fee share settlements

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS parent_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS partners_parent_partner_idx
  ON partners (parent_partner_id);

COMMENT ON COLUMN partners.parent_partner_id IS
  'Upper partner (agent line). NULL = directly under admin. Child fee % should be >= parent fee %.';

ALTER TABLE agent_settlements
  ADD COLUMN IF NOT EXISTS admin_fee_krw numeric(20,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN agent_settlements.admin_fee_krw IS
  'Admin remainder of leaf fee pool after parent differentials';

CREATE TABLE IF NOT EXISTS agent_settlement_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  source_partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  payee_partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  payee_agent_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  share_kind text NOT NULL CHECK (share_kind IN ('parent_agent', 'admin')),
  rate_percent numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  due_krw numeric(20,2) NOT NULL CHECK (due_krw >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_settlement_shares_settlement_idx
  ON agent_settlement_shares (settlement_id);

CREATE INDEX IF NOT EXISTS agent_settlement_shares_payee_idx
  ON agent_settlement_shares (payee_partner_id, created_at DESC);

COMMENT ON TABLE agent_settlement_shares IS
  'Fee-pool split: parent agents take differential of lower fee %; admin takes remainder';
