-- Partner API key issuance metadata; empty hash = not issued (blocked from Partner API).
ALTER TABLE partners
  ALTER COLUMN api_key_hash DROP NOT NULL;

ALTER TABLE partners
  ALTER COLUMN api_key_hash SET DEFAULT '';

UPDATE partners SET api_key_hash = '' WHERE api_key_hash IS NULL;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS api_key_prefix text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS api_key_issued_at timestamptz;

-- Existing hashed keys count as issued (prefix unknown until next rotate).
UPDATE partners
SET api_key_issued_at = COALESCE(api_key_issued_at, created_at)
WHERE api_key_hash IS NOT NULL AND length(api_key_hash) = 64 AND api_key_issued_at IS NULL;

COMMENT ON COLUMN partners.api_key_hash IS
  'SHA-256 hex of partner API key; empty string means no key issued (API blocked)';
COMMENT ON COLUMN partners.api_key_prefix IS
  'Public prefix of last issued key for admin display (e.g. pk_s01_xxxx…)';
