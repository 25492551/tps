-- 001_init.sql — placeholder first migration
-- Replace with real schema. Apply in numeric order.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
