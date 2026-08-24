# Reject agent create when solution already has an agent

**When**: 2026-08-24T155447 UTC

## Summary

Creating or assigning an agent to a solution that already has `partners.agent_user_id` set is rejected (409) instead of demoting the previous agent. Create/edit UI disables occupied solutions and shows the error early.

## Changes

- `04_script/apps/api/src/routes/admin.ts` — POST/PATCH `/users` reject occupied solution
- `04_script/apps/web/src/portals/admin/pages.tsx` — client checks + disabled options
- `07_manual/02_tether_market_ops.md`
