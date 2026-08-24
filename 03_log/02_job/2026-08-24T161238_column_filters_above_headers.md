# Move column filters above header row

**When**: 2026-08-24T161238 UTC

## Summary

All tables using `ColumnFilterRow` now render filters above the column title row (site-wide: admin, agent, user, member detail).

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` (+ rates table left without filters)
- `04_script/apps/web/src/portals/admin/AgentStatsPage.tsx`
- `04_script/apps/web/src/portals/admin/SolutionKeysPage.tsx`
- `04_script/apps/web/src/portals/agent/pages.tsx`
- `04_script/apps/web/src/portals/user/pages.tsx`
- `04_script/apps/web/src/portals/shared/MemberDetailPage.tsx`
- `07_manual/02_tether_market_ops.md`
