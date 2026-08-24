# OTC buy/sell dual amount fields

## Summary

Buy/sell forms no longer use a KRW/USDT toggle. Pay and receive amounts sit in stacked cards; typing either side converts the other. Visual cues (gold KRW / mint USDT, arrow, focus ring) show the flow. Order APIs unchanged.

## Changes

- `04_script/apps/web/src/portals/user/pages.tsx` — `OtcOrderForm` + `FxLeg`
- `04_script/apps/web/src/styles.css` — `.fx-pair` / `.fx-leg` / `.fx-arrow`
- `07_manual/02_tether_market_ops.md` — buy/sell input steps
