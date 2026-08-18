-- 008_otc_trades.sql — admin OTC: nullable listing, kind, price snapshot, extra statuses

ALTER TABLE trades ALTER COLUMN listing_id DROP NOT NULL;

ALTER TABLE trades ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS price_krw_per_usdt numeric(20, 2);

UPDATE trades SET kind = 'legacy_p2p' WHERE kind IS NULL;

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_kind_check;
ALTER TABLE trades ADD CONSTRAINT trades_kind_check
  CHECK (kind IN ('buy_from_admin', 'sell_to_admin', 'legacy_p2p'));

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE trades ADD CONSTRAINT trades_status_check
  CHECK (status IN (
    'awaiting_dual_deposit',
    'awaiting_user_deposit',
    'awaiting_admin_payout',
    'krw_confirmed',
    'usdt_confirmed',
    'both_held',
    'completed',
    'cancelled',
    'disputed'
  ));

COMMENT ON COLUMN trades.kind IS
  'buy_from_admin = user buys USDT from admin; sell_to_admin = user sells USDT to admin; legacy_p2p = old dual-deposit';
COMMENT ON COLUMN trades.price_krw_per_usdt IS
  'FX snapshot at order create (OTC)';
