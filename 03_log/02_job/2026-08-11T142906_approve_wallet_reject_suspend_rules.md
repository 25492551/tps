# User approve issues wallet; reject/suspend rules

**When**: 2026-08-11T142906 UTC

## Summary

- Approve sets `active` and issues the default managed wallet (signup no longer creates one).
- Reject only allowed from `pending_approval` (once approved → suspend only).
- Suspend only from `active`; UI hides buttons accordingly.

## Changes

- `04_script/apps/api/src/routes/admin.ts`, `auth.ts`, `managedWallet.ts`
- `04_script/apps/web/src/portals/admin/pages.tsx`
- `dictionary.md`, `07_manual/02_tether_market_ops.md`
