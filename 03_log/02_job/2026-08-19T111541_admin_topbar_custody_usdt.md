# Admin top bar custody USDT total

**When**: 2026-08-19T111541 UTC

## Summary

Admin top bar shows sum of custody on-chain USDT (link to `/admin/wallets`). Included in `/api/admin/holds/pending` with ~20s cache.

## Changes

- `04_script/apps/api/src/custodyWallets.ts` — `getCustodyTotalUsdtCached`
- `04_script/apps/api/src/routes/admin.ts` — `custodyUsdtTotal` on pending poll
- `04_script/apps/web/src/portals/admin/AdminShell.tsx` — top bar chip
- `04_script/apps/web/src/styles.css`
- `07_manual/02_tether_market_ops.md`
