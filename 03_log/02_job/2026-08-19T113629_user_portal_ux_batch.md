# User portal UX: top bar, buy/sell, profile, trades

**When**: 2026-08-19T113629 UTC

## Summary

User shell top bar shows USDT balance. Wallets drop external withdraw. Buy/sell add thousand commas, quick amount chips, rate provider/time/interval. New `/app/me` (내 정보) for bank view. Trades list: no ID link/chat; kind/status filters. Trade detail no longer has chat UI.

## Changes

- `04_script/apps/api/src/routes/orders.ts` — rate meta labels
- `04_script/apps/web/src/portals/user/UserShell.tsx` — top bar USDT
- `04_script/apps/web/src/portals/user/pages.tsx` — wallets, OTC form, ProfilePage, trades
- `04_script/apps/web/src/App.tsx` — `/app/me`
- `04_script/apps/web/src/styles.css`
- `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
