-- 020_user_access_logs.sql — member login / handoff access history

CREATE TABLE IF NOT EXISTS user_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event text NOT NULL DEFAULT 'login'
    CHECK (event IN ('login', 'handoff')),
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_access_logs_user_created_idx
  ON user_access_logs (user_id, created_at DESC);
