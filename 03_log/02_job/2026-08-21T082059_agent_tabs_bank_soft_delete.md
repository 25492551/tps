# Agent trading tabs + profile bank soft-delete

## Summary

Agent portal now includes the same trading tabs as `/app` (wallets, me, buy/sell, transfer, trades, own ledger). Buy/sell stay visible when permission is off and show an ask-admin banner. Member `/app/banks` nav removed; bank add/soft-delete live under `/app/me` (`status=deleted`, row kept).

## Changes

- `04_script/db/022_bank_account_deleted_status.sql` — allow `deleted` status
- `04_script/apps/api/src/routes/assets.ts` — soft-delete endpoint; hide deleted from list
- `04_script/apps/api/src/partner/routes.ts` — skip deleted banks on upsert lookup
- `04_script/apps/web/src/lib/portalBase.ts` — `/app` vs `/agent` base path
- `04_script/apps/web/src/portals/user/pages.tsx` — portal-aware links; ProfilePage bank UX; BanksPage redirect
- `04_script/apps/web/src/portals/user/UserShell.tsx` — drop banks tab; always show buy/sell
- `04_script/apps/web/src/portals/agent/AgentShell.tsx` — trading + solution nav
- `04_script/apps/web/src/portals/agent/pages.tsx` — home quick links
- `04_script/apps/web/src/App.tsx` — agent trading routes
- `02_layout/03_as_built_ia.md`, `dictionary.md`, `07_manual/02_tether_market_ops.md`
