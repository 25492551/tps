# Agent topbar: today solution deposit KRW

## Summary

Agent top bar shows **금일 입금** for the agent's own solution: sum of completed `buy_from_admin` KRW for that partner's members today (KST), via `GET /api/agent/me`.

## Changes

- `04_script/apps/api/src/routes/agent.ts` — `todayDepositKrw` on `/me`
- `04_script/apps/web/src/portals/agent/AgentShell.tsx` — top bar chip
- `07_manual/02_tether_market_ops.md`
