# Whole-won KRW for sell + display

**When**: 2026-08-19T110847 UTC

## Summary

KRW amounts are whole won only across OTC sell (API + UI) and displays. Sell `amount_krw` = floor(USDT × rate). UI strips decimal KRW input; trade/hold screens use `formatKrw`.

## Changes

- `04_script/apps/api/src/routes/orders.ts` — sell stores integer KRW via `Math.floor`
- `04_script/apps/web/src/portals/user/pages.tsx` — sell whole-won calc/display; KRW input no decimals
- `04_script/apps/web/src/portals/admin/pages.tsx` — holds + ledger KRW via `formatKrw`
- `07_manual/02_tether_market_ops.md` — sell integer KRW note
- `dictionary.md` — OTC sell KRW term
