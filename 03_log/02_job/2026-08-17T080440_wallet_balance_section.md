# Wallet pages: on-chain USDT balance section

**When**: 2026-08-17T080440 UTC

## Summary

Added a **잔고** section on admin and user tether wallet pages. Balances come from TronGrid `balanceOf` (TRC-20 USDT); user page also shows ledger KRW/USDT.

## Changes

- `04_script/apps/api/src/tronUsdt.ts` — Tron USDT balance helper
- `04_script/apps/api/src/custodyWallets.ts`, `routes/admin.ts`, `routes/assets.ts`
- `04_script/apps/web` — AdminWalletsPage + WalletsPage balance UI
- `07_manual/02_tether_market_ops.md`
