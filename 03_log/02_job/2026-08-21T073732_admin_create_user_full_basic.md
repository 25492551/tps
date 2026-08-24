# Admin create user: full basic fields + role

**When**: 2026-08-21T073732 UTC

## Summary

`/admin/users` create modal now accepts full basic fields and role choice (회원 / 에이전트). Agent create requires a solution. API `POST /api/admin/users` supports role, partnerId, status, buy/sell permissions.

## Changes

- `04_script/apps/api/src/routes/admin.ts` — expand user create
- `04_script/apps/web/src/portals/admin/pages.tsx` — create modal fields
- `07_manual/02_tether_market_ops.md`
