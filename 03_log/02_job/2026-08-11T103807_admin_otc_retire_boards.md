# Job: Admin OTC — remove boards, admin as counterparty

**When**: 2026-08-11T103807 UTC

## Summary

Retired P2P listing boards. Users now place buy/sell OTC orders against the admin at the site FX rate. Admin confirms the single-side deposit and the system pays the other asset. Added internal USDT transfer; wallet UI is view + external withdrawal only. Updated north star docs.

## Changes

- `04_script/db/008_otc_trades.sql`
- `04_script/apps/api` — `orders.ts`, `transfers.ts`, OTC settle in `trades.ts`; listings 410; wallets POST 410; removed `boardAccess.ts`
- `04_script/apps/web` — buy/sell OTC forms, transfer page, trades list, admin holds retitle; boards nav removed
- `.cursorrules`, `dictionary.md`, `02_layout/*`, `07_manual/02_tether_market_ops.md`, `06_docs/01_plan_archive_worklog.md`
