# Job: Admin users search + edit

**When**: 2026-08-19T093500 UTC

## Summary

`/admin/users`: login-id search (`?q=`) and **수정** modal (display name, login id, optional password).

## Changes

- `04_script/apps/api/src/routes/admin.ts` — users list `q`/`loginId`; PATCH `loginId`/`password`
- `04_script/apps/web/src/portals/admin/pages.tsx` — search bar + edit modal
