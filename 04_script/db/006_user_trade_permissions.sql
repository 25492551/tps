-- 006_user_trade_permissions.sql — separate buy / sell tether permissions

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_buy_tether boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_sell_tether boolean NOT NULL DEFAULT true;

INSERT INTO schema_migrations (id) VALUES ('006_user_trade_permissions') ON CONFLICT DO NOTHING;
