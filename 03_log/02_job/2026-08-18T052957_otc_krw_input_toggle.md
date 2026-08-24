# Job: Buy/sell KRW input unit toggle (default KRW)

**When**: 2026-08-18T052957 UTC

## Summary

Member portal 테더 구매/판매 forms accept amount in **KRW (default)** or **USDT** via a unit toggle. KRW input converts to USDT with the applied OTC rate before order submit.

## Changes

- `04_script/apps/web/src/portals/user/pages.tsx` — `OtcOrderForm` unit toggle + conversion
- `04_script/apps/web/src/styles.css` — `.unit-toggle`
- `07_manual/02_tether_market_ops.md` — member order input note
