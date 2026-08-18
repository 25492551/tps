# Board browse gated by counterpart permission

**When**: 2026-08-11T061200 UTC

## Summary

Buy-only users can create buy listings (via **내 거래**) but cannot browse the public buy board. Sell-only users can create sell listings but cannot browse the public sell board. Users with both permissions can browse all boards. Nav and API enforce the same rules; own listings remain available at `/api/listings/mine`.

## Changes

- `04_script/apps/api/src/boardAccess.ts` — browse buy ⇔ `canSellTether`; browse sell ⇔ `canBuyTether`
- `04_script/apps/api/src/routes/listings.ts` — board list 403; `GET /api/listings/mine` for own posts
- `04_script/apps/web/src/lib/api.ts` — `canViewBuyBoard` / `canViewSellBoard` helpers
- `04_script/apps/web/src/portals/user/UserShell.tsx` — hide board nav by browse perm
- `04_script/apps/web/src/portals/user/pages.tsx` — board redirect; **내 거래** create + mine list
- `02_layout/03_as_built_ia.md`, `dictionary.md`, `07_manual/02_tether_market_ops.md` — docs sync
