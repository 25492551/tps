-- 003_ledger_seq.sql — stable ledger ordering within a transaction

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS seq bigserial;

CREATE INDEX IF NOT EXISTS idx_ledger_user_asset_seq
  ON ledger_entries(user_id, asset, seq DESC);

INSERT INTO schema_migrations (id) VALUES ('003_ledger_seq') ON CONFLICT DO NOTHING;
