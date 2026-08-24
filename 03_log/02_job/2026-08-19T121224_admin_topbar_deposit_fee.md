# Admin top bar: today deposit + platform fee

**When**: 2026-08-19T121224 UTC

## Summary

Admin top bar shows today's (KST) completed OTC buy KRW sum, and platform fee revenue (sum of each solution's fee cut on those partner buys).

## Changes

- `04_script/apps/api/src/routes/admin.ts` — `/holds/pending` adds `todayDepositKrw`, `todayPlatformFeeKrw`
- `04_script/apps/web/src/portals/admin/AdminShell.tsx` — chips
- `04_script/apps/web/src/styles.css`, `07_manual/02_tether_market_ops.md`
