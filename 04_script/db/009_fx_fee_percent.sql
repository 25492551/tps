-- 009_fx_fee_percent.sql — OTC fee percent on site FX rate

INSERT INTO site_settings (key, value, updated_at)
VALUES ('fx_fee_percent', '0'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
