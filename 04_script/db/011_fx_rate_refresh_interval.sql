-- 011_fx_rate_refresh_interval.sql — OTC spot refresh interval + cached snapshot

INSERT INTO site_settings (key, value, updated_at)
VALUES ('fx_rate_refresh_interval', '"1h"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
