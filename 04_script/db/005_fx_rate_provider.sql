-- 005_fx_rate_provider.sql — selected USDT/KRW rate source

INSERT INTO site_settings (key, value)
VALUES ('fx_rate_provider', '"upbit"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (id) VALUES ('005_fx_rate_provider') ON CONFLICT DO NOTHING;
