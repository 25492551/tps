# Rename s01-agnet → s01-agent + fix admin edit

**When**: 2026-08-19T110034 UTC

## Summary

Login id updated to `s01-agent`. Admin user edit now preselects the agent’s solution and syncs `partner_members.external_login_id` on loginId change so agent saves no longer roll back id updates.

## Changes

- DB: `users.email` / `partner_members.external_login_id` → `s01-agent`
- `04_script/apps/api/src/routes/admin.ts` — partner resolve via `agent_user_id`; sync external_login_id
- `04_script/apps/web/src/portals/admin/pages.tsx` — partner select default for current agent
- `07_manual/02_tether_market_ops.md`
