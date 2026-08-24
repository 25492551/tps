-- 026_one_active_bank_per_user.sql — at most one active user bank account

-- Keep newest active bank per user; disable the rest.
UPDATE bank_accounts ba
SET status = 'disabled'
WHERE ba.is_custody = false
  AND ba.status = 'active'
  AND ba.user_id IS NOT NULL
  AND ba.id <> (
    SELECT b2.id
    FROM bank_accounts b2
    WHERE b2.user_id = ba.user_id
      AND b2.is_custody = false
      AND b2.status = 'active'
    ORDER BY b2.created_at DESC, b2.id DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_user_one_active_uidx
  ON bank_accounts (user_id)
  WHERE is_custody = false AND status = 'active' AND user_id IS NOT NULL;

COMMENT ON INDEX bank_accounts_user_one_active_uidx IS
  'At most one active (non-custody) bank account per user';
