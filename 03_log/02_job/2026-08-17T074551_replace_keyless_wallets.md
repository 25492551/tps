# Replace keyless wallets with keyed custody default

**When**: 2026-08-17T074551 UTC

## Summary

Deleted all `tether_wallets` rows without `private_key_enc` (4 legacy user-registered + 1 seed custody address-only). Created a new default custody wallet with encrypted private key. Updated seed to generate keyed custody wallets instead of a hardcoded address.

## Changes

- DB data: removed 5 keyless wallets; new custody `TEVhe3AZSB2zpfhy9EP1mCwdHBMzwNhjcn`
- `04_script/apps/api/src/seed.ts` — `createCustodyWallet` on seed
