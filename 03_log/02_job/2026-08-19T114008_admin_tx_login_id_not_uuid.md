# Admin transactions: show login id not UUID

**When**: 2026-08-19T114008 UTC

## Summary

`/admin/transactions` manual adjust uses member login id (not UUID hash). Ledger-adjust API accepts `loginId`.

## Changes

- `04_script/apps/api/src/routes/admin.ts` — `POST /ledger-adjust` resolves `loginId`
- `04_script/apps/web/src/portals/admin/pages.tsx` — 회원 아이디 field
