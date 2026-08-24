# Move ledger adjust to member popup; remove transactions form

**When**: 2026-08-24T162034 UTC

## Summary

Removed the manual ledger-adjust panel from `/admin/transactions`. Admin member popup balance section now has 지급/회수 per USDT and KRW (calls existing `/api/admin/ledger-adjust`).

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` — `AdminTransactionsPage`
- `04_script/apps/web/src/portals/shared/MemberDetailPage.tsx`
- `04_script/apps/web/src/styles.css` — `.member-balance-*`
- `07_manual/02_tether_market_ops.md`
