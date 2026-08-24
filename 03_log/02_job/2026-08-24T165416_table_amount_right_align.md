# Job: Site-wide table amount columns right-aligned

**When (UTC)**: 2026-08-24T165416

## Summary

All table money/numeric amount columns (USDT, KRW, 금액, 잔액, 총입금, 지급, 수량, etc.) are right-aligned via `.col-amount`. Filter columns use `FilterFieldDef.align: 'right'`; headers use shared `TableHeaderRow`.

## Changes

- `04_script/apps/web/src/lib/tableFilters.tsx` — `align`, `colAmountClass`, `TableHeaderRow`
- `04_script/apps/web/src/styles.css` — `.col-amount`
- `04_script/apps/web/src/portals/{user,admin,agent}/**`, `shared/MemberDetailPage.tsx`, `admin/AgentStatsPage.tsx`
