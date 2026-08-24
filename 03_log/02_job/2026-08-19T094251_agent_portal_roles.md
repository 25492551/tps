# Agent portal + member/agent roles

**When**: 2026-08-19T094251 UTC

## Summary

Added agent portal (`/agent`) so a solution agent can view that partner’s member transactions and member list. User roles are `admin` | `agent` | `member` (legacy `user` → `member`). At most one agent per partner via `partners.agent_user_id`.

## Changes

- `04_script/db/017_agent_member_roles.sql` — role check + `partners.agent_user_id`
- `04_script/apps/api/src/routes/agent.ts` — `/api/agent/me|members|transactions`
- `04_script/apps/api/src/routes/admin.ts` — PATCH role/partner; promote demotes previous agent
- `04_script/apps/api/src/types.ts`, `middleware.ts`, `auth.ts`, `seed.ts`, `managedWallet.ts`, `index.ts`
- `04_script/apps/web/src/portals/agent/` — shell + home/transactions/members
- `04_script/apps/web/src/App.tsx`, `lib/api.ts`, `lib/auth.tsx` — portal `agent`, `tps_token_agent`
- `04_script/apps/web/src/portals/admin/pages.tsx` — role + solution assign
- `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/01_local_run.md`, `07_manual/02_tether_market_ops.md`
