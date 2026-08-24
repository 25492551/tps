# Column header filters (S01-style)

**When**: 2026-08-24T093322 UTC

## Summary

Replaced the add/remove `TableFilterBar` with a second header row of per-column filters (S01 cash-admin pattern). Text columns substring-search; select columns match exactly; conditions AND together. URL `?loginId=` still seeds the login-id column on admin/agent transaction pages.

## Changes

- `04_script/apps/web/src/lib/tableFilters.tsx` — `values` map, `ColumnFilterRow`, `TableCount`, `filterCols`
- `04_script/apps/web/src/styles.css` — `.col-filter-row` / `.col-filter`
- Admin / agent / member tables: `pages.tsx`, `SolutionKeysPage.tsx`, `AgentStatsPage.tsx`, `MemberDetailPage.tsx`, `user/pages.tsx`
- `07_manual/02_tether_market_ops.md`, `02_layout/03_as_built_ia.md`
