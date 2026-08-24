-- Soft-delete status for user KRW bank accounts (row kept; status = deleted).
ALTER TABLE bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_status_check;

ALTER TABLE bank_accounts
  ADD CONSTRAINT bank_accounts_status_check
  CHECK (status IN ('pending', 'active', 'disabled', 'deleted'));
