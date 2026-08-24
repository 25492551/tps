# Agent fee percent + settlements

**When**: 2026-08-19T105404 UTC

## Summary

Per-partner agent fee % (platform cut). Admin previews and completes period settlements of unsettled OTC buy KRW; agent sees accrued due and history. Agent due = floor(gross × (1 − fee/100)).

## Changes

- `04_script/db/019_agent_fee_settlements.sql`
- `04_script/apps/api/src/agentSettlement.ts`
- `04_script/apps/api/src/routes/admin.ts`, `routes/agent.ts`
- `04_script/apps/web/src/portals/admin/pages.tsx`, `AdminShell.tsx`
- `04_script/apps/web/src/portals/agent/pages.tsx`, `AgentShell.tsx`
- `04_script/apps/web/src/App.tsx`
- `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
