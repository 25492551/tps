-- 019_agent_fee_settlements.sql — per-partner agent fee % + settlements

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS agent_fee_percent numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_agent_fee_percent_check;
ALTER TABLE partners
  ADD CONSTRAINT partners_agent_fee_percent_check
  CHECK (agent_fee_percent >= 0 AND agent_fee_percent <= 100);

COMMENT ON COLUMN partners.agent_fee_percent IS
  'Platform cut % on completed member OTC buy KRW; agent receives floor(gross*(1-fee/100))';

CREATE TABLE IF NOT EXISTS agent_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  agent_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  gross_krw numeric(20,2) NOT NULL CHECK (gross_krw >= 0),
  fee_percent numeric(5,2) NOT NULL CHECK (fee_percent >= 0 AND fee_percent <= 100),
  agent_due_krw numeric(20,2) NOT NULL CHECK (agent_due_krw >= 0),
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed')),
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS agent_settlements_partner_idx
  ON agent_settlements (partner_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS agent_settlement_trades (
  settlement_id uuid NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  PRIMARY KEY (settlement_id, trade_id),
  UNIQUE (trade_id)
);

CREATE INDEX IF NOT EXISTS agent_settlement_trades_settlement_idx
  ON agent_settlement_trades (settlement_id);

COMMENT ON TABLE agent_settlements IS 'Completed agent KRW settlements for a partner period';
COMMENT ON TABLE agent_settlement_trades IS 'OTC buy trades included in an agent settlement (at most once)';
