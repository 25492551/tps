# Admin custody tether wallets page

**When**: 2026-08-12T044654 UTC

## Summary

Added admin **테더지갑** (`/admin/wallets`): create (keygen + encrypted key), register address (± private key), set OTC default deposit wallet, and record USDT moves between custody wallets (complete/cancel after on-chain send).

## Changes

- `04_script/db/012_admin_custody_wallets.sql`
- `04_script/apps/api/src/custodyWallets.ts`, `routes/admin.ts`, `routes/trades.ts`
- `04_script/apps/web` — AdminShell, App, `AdminWalletsPage`
- `dictionary.md`, `07_manual/02_tether_market_ops.md`, `02_layout/03_as_built_ia.md`
