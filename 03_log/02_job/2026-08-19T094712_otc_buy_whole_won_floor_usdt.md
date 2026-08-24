# OTC buy: whole-won KRW, floor USDT 2dp

**When**: 2026-08-19T094712 UTC

## Summary

Buy-from-admin now stores integer KRW and floors USDT to 2 decimal places so the user pays whole won and may receive slightly less USDT when the rate does not divide evenly.

## Changes

- `04_script/apps/api/src/routes/orders.ts` — `normalizeBuyAmounts`; accept `amountKrw` (or derive from USDT)
- `04_script/apps/web/src/portals/user/pages.tsx` — buy form integer KRW input; submit `amountKrw`
- `04_script/apps/web/src/lib/api.ts` — `floor2`, `formatKrw`
- `dictionary.md`, `07_manual/02_tether_market_ops.md`
