# Job: Auto-create admin-managed default TRC-20 wallet on signup

**When**: 2026-08-11T062205 UTC

## Summary

On user registration (and admin user create), the API generates a TRC-20 keypair, attaches it as the user’s default wallet, and stores the private key encrypted for admin custody. Users see the address only; admins can reveal the key from 유저 관리. Existing users are backfilled on API start/seed.

## Changes

- `04_script/db/007_platform_managed_wallets.sql`
- `04_script/apps/api/src/tronWallet.ts`, `walletCrypto.ts`, `managedWallet.ts`
- `04_script/apps/api/src/routes/auth.ts`, `admin.ts`, `assets.ts`, `seed.ts`, `index.ts`
- `04_script/apps/web` — wallets page + admin user key reveal
- `dictionary.md`, `07_manual/02_tether_market_ops.md`, `02_layout/03_as_built_ia.md`
- deps: `@noble/secp256k1`, `@noble/hashes`; env `WALLET_KEY_SECRET`
