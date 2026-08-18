# Split OTC buy/sell FX fee percents

**When**: 2026-08-11T143453 UTC

## Summary

Admin rates now configure separate **테더 구매 수수료** and **테더 판매 수수료**. Order pricing and rate preview use the side-specific percent. Existing single fee is copied into both keys on migrate.

## Changes

- `04_script/db/010_fx_buy_sell_fee_percent.sql`
- `04_script/apps/api/src/settings.ts`, `routes/admin.ts`, `routes/orders.ts`
- `04_script/apps/web/src/portals/admin/pages.tsx`
- `dictionary.md`, `07_manual/02_tether_market_ops.md`, `02_layout/03_as_built_ia.md`
