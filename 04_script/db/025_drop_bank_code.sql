-- 025_drop_bank_code.sql — bank name/account/holder enough; drop unused bank_code

ALTER TABLE bank_accounts DROP COLUMN IF EXISTS bank_code;
ALTER TABLE bank_change_requests DROP COLUMN IF EXISTS bank_code;
