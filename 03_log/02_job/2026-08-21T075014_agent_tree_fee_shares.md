# Agent partner tree + differential fee shares

**When**: 2026-08-21T075014 UTC

## Summary

Added S01-style partner agent tree (`parent_partner_id`). Leaf fee pool splits differentially: parent agents take (ownRate − nextUpperRate)% of gross; admin takes remainder. Admin tabs: 에이전트 트리, 에이전트 통계. Agent settlements show receivable from sub-agents.

Example: L1 fee 1%, L2 fee 2% on L2 volume → L1 gets 1% of gross from fee pool, admin gets remainder of 2% pool; L2 agent still gets floor(gross×0.98).

## Changes

- `04_script/db/021_agent_partner_tree.sql`
- `04_script/apps/api/src/agentSettlement.ts` — splitFeePool, ancestor chain, shares
- `04_script/apps/api/src/routes/admin.ts` — tree/parent/stats APIs; settlement preview shares
- `04_script/apps/api/src/routes/agent.ts` — sub-agent receivable on settlements
- `04_script/apps/web/src/portals/admin/AgentTreePage.tsx`, `AgentStatsPage.tsx`
- Admin shell/nav, fees table parent column, settlement preview, agent settlements UI
- `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
