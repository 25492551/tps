# Job: Trades list — status filter as select

**When (UTC)**: 2026-08-24T164842

## Summary

Changed `/app/trades` status column filter from text search to a dropdown (same pattern as 유형 filter).

## Changes

- `04_script/apps/web/src/portals/user/pages.tsx` — `TradesListPage` status field `type: 'select'` with Korean labels
- `07_manual/02_tether_market_ops.md`
