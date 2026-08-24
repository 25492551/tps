# Admin holds: drop on-chain retry; show requester columns

**When**: 2026-08-19T115959 UTC

## Summary

Removed 「온체인 재시도」 from `/admin/holds`. Table adds requester login id, solution, and bank account (active user bank).

## Changes

- `04_script/apps/api/src/routes/admin.ts` — holds query joins user/partner/bank
- `04_script/apps/web/src/portals/admin/pages.tsx` — columns + remove settle button
