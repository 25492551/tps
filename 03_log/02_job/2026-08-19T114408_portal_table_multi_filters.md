# Multi-filter on portal data tables

**When**: 2026-08-19T114408 UTC

## Summary

Wired reusable `TableFilterBar` / `useMultiFilters` onto every admin, agent, and member portal page that renders a data `<table>`. Filtering is client-side on already-loaded rows; no new backend APIs. Server-side single-field search forms were replaced where applicable. URL `loginId` deep-links still initialize a client filter on admin/agent transaction pages.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` — users, bank-requests, holds, transactions, wallets (×2), agent-fees, agent-settlements (preview + history)
- `04_script/apps/web/src/portals/agent/pages.tsx` — transactions, members, settlements
- `04_script/apps/web/src/portals/user/pages.tsx` — banks, profile, trades list, transactions
- `07_manual/02_tether_market_ops.md` — operator notes for multi-filter UX
