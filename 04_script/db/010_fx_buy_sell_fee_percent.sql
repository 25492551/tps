-- 010_fx_buy_sell_fee_percent.sql — separate OTC buy/sell fee percents

INSERT INTO site_settings (key, value, updated_at)
SELECT 'fx_buy_fee_percent', COALESCE(
  (SELECT value FROM site_settings WHERE key = 'fx_fee_percent'),
  '0'::jsonb
), now()
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'fx_buy_fee_percent');

INSERT INTO site_settings (key, value, updated_at)
SELECT 'fx_sell_fee_percent', COALESCE(
  (SELECT value FROM site_settings WHERE key = 'fx_fee_percent'),
  '0'::jsonb
), now()
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'fx_sell_fee_percent');
