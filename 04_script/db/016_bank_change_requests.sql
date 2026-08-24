-- 016_bank_change_requests.sql — user bank register/change needs admin approval

CREATE TABLE IF NOT EXISTS bank_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_code text NOT NULL DEFAULT '',
  bank_name text NOT NULL,
  account_no text NOT NULL,
  holder_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  review_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_change_requests_pending_idx
  ON bank_change_requests (status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS bank_change_requests_user_idx
  ON bank_change_requests (user_id, created_at DESC);

-- At most one pending request per user
CREATE UNIQUE INDEX IF NOT EXISTS bank_change_requests_one_pending_uidx
  ON bank_change_requests (user_id)
  WHERE status = 'pending';
