-- 004_site_settings.sql — site-wide admin toggles

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- allow_multi_account_browser: when true, same browser may log in as different users
INSERT INTO site_settings (key, value)
VALUES ('allow_multi_account_browser', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (id) VALUES ('004_site_settings') ON CONFLICT DO NOTHING;
