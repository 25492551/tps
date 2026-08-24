# Period range display: wrap after tilde, right-align end

**When**: 2026-08-24T162559 UTC

## Summary

Shared `PeriodRange` shows start on the first line and `~ end` on the second line (right-aligned). Used on admin and agent settlement history period columns. Also fixed a broken filter row on agent “하부 미정산 차등” table.

## Changes

- `04_script/apps/web/src/lib/PeriodRange.tsx`
- `04_script/apps/web/src/styles.css` — `.period-range`
- `04_script/apps/web/src/portals/admin/pages.tsx`
- `04_script/apps/web/src/portals/agent/pages.tsx`
- `07_manual/02_tether_market_ops.md`
