-- Public (access) + encrypted private (secret) for admin display.
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS api_public_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS api_secret_enc text NOT NULL DEFAULT '';

UPDATE partners
SET api_public_key = api_key_prefix
WHERE api_public_key = ''
  AND api_key_prefix <> ''
  AND api_key_prefix NOT LIKE '%…%'
  AND length(api_key_prefix) >= 20;

COMMENT ON COLUMN partners.api_public_key IS
  'Partner access/public key shown on admin API 키 관리 (not used for X-Partner-Key auth)';
COMMENT ON COLUMN partners.api_secret_enc IS
  'AES-GCM encrypted private/secret key for admin reveal; auth still uses api_key_hash';
