# S01 agent account + case-insensitive login id

**When**: 2026-08-19T100151 UTC

## Summary

Created S01 Game agent login `s01-agnet` (password set by operator). Login ids are stored lowercase and looked up case-insensitively (`lower(email)`).

## Changes

- `04_script/db/018_login_id_case_insensitive.sql`
- `04_script/apps/api/src/loginId.ts`, `routes/auth.ts`, `routes/admin.ts`, `routes/agent.ts`, `routes/transfers.ts`, `partner/routes.ts`, `seed.ts`
- `dictionary.md`, `07_manual/01_local_run.md`, `07_manual/02_tether_market_ops.md`
- DB: user `s01-agnet` role=agent; `partners.s01.agent_user_id` linked
