# Deposit series charts on admin/agent home

**When**: 2026-08-24T155257 UTC

## Summary

Admin home shows a multi-solution daily KRW deposit (completed buy) time-series chart. Agent home shows the same chart scoped to the agent’s solution only. Period selector: 1 day / 1 week (default) / 1 month / 3 months (KST calendar days).

## Changes

- `04_script/apps/api/src/depositSeries.ts` — shared daily series query
- `04_script/apps/api/src/routes/admin.ts` — `GET /api/admin/deposit-series`
- `04_script/apps/api/src/routes/agent.ts` — `GET /api/agent/deposit-series`
- `04_script/apps/web/src/portals/shared/DepositSeriesChart.tsx`
- `04_script/apps/web/src/portals/admin/pages.tsx` — AdminHome chart
- `04_script/apps/web/src/portals/agent/pages.tsx` — AgentHome chart
- `04_script/apps/web/src/styles.css`
- `07_manual/02_tether_market_ops.md`
