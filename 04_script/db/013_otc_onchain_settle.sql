-- 013_otc_onchain_settle.sql — on-chain USDT settle status + tx id

ALTER TABLE trades ADD COLUMN IF NOT EXISTS onchain_txid text;

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE trades ADD CONSTRAINT trades_status_check
  CHECK (status IN (
    'awaiting_dual_deposit',
    'awaiting_user_deposit',
    'awaiting_admin_payout',
    'settling_onchain',
    'krw_confirmed',
    'usdt_confirmed',
    'both_held',
    'completed',
    'cancelled',
    'disputed'
  ));

COMMENT ON COLUMN trades.onchain_txid IS
  'Tron TRC-20 USDT transfer tx id for OTC buy/sell settlement';
