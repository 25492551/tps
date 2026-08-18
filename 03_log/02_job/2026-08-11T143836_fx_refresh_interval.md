# FX refresh interval; remove reselect button

**When**: 2026-08-11T143836 UTC

## Summary

Removed **다시 선택** on `/admin/rates` (selected source shows badge only). Added OTC spot **업데이트 주기** (`1h`/`6h`/`1d`/`3d`/`1w`); selected provider rate is cached in `site_settings` and reused until the interval expires (or admin taps **현재가** on the selected source).

## Changes

- `04_script/db/011_fx_rate_refresh_interval.sql`
- `04_script/apps/api/src/rates.ts`, `settings.ts`, `routes/admin.ts`, `routes/orders.ts`
- `04_script/apps/web/src/portals/admin/pages.tsx`
- `dictionary.md`, `07_manual/02_tether_market_ops.md`, `02_layout/03_as_built_ia.md`
