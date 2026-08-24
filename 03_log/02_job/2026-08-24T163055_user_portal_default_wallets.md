# Job: User portal — remove home tab, default to wallets

**When (UTC)**: 2026-08-24T163055

## Summary

Removed user portal **홈** tab; `/app` redirects to `/app/wallets`; login default path is `/app/wallets`.

## Changes

- `04_script/apps/web/src/App.tsx` — index → `Navigate` to `wallets`
- `04_script/apps/web/src/portals/user/UserShell.tsx` — drop 홈 nav link
- `04_script/apps/web/src/lib/api.ts` — `homePathForRole` member → `/app/wallets`
- `04_script/apps/web/src/portals/user/pages.tsx` — remove `UserHome`
- `02_layout/03_as_built_ia.md`, `07_manual/01_local_run.md`, `07_manual/02_tether_market_ops.md`
