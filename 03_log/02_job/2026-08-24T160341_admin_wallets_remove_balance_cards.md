# Admin wallets: remove balance cards

**When**: 2026-08-24T160341 UTC

## Summary

Removed the on-chain USDT balance card grid from `/admin/wallets`. Balances remain in the wallet table; refresh moved to the page header.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` — `AdminWalletsPage`
- `07_manual/02_tether_market_ops.md`
