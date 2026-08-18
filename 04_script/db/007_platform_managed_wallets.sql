-- 007_platform_managed_wallets.sql — per-user default TRC-20 wallet; admin holds private key

ALTER TABLE tether_wallets
  ADD COLUMN IF NOT EXISTS is_platform_managed boolean NOT NULL DEFAULT false;

ALTER TABLE tether_wallets
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE tether_wallets
  ADD COLUMN IF NOT EXISTS private_key_enc text;

-- Drop failed full unique index if a prior migrate attempt created nothing / partial
DROP INDEX IF EXISTS tether_wallets_address_uidx;

-- One default wallet per user (platform-managed)
CREATE UNIQUE INDEX IF NOT EXISTS tether_wallets_user_default_uidx
  ON tether_wallets (user_id)
  WHERE is_default = true AND user_id IS NOT NULL;

-- Unique among platform-managed addresses (external user-registered may historically collide)
CREATE UNIQUE INDEX IF NOT EXISTS tether_wallets_managed_address_uidx
  ON tether_wallets (address)
  WHERE is_platform_managed = true;

COMMENT ON COLUMN tether_wallets.is_platform_managed IS
  'When true, admin holds encrypted private key; created on user signup as default wallet';
COMMENT ON COLUMN tether_wallets.private_key_enc IS
  'AES-GCM ciphertext of TRC-20 private key; admin-only; never returned to users';
