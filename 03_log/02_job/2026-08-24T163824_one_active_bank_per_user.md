# Job: One active bank account per user

**When (UTC)**: 2026-08-24T163824

## Summary

Enforced at most one **active** non-custody bank account per user. Existing duplicates kept the newest (`created_at`) as `active` and set older rows to `disabled`.

## Changes

- `04_script/db/026_one_active_bank_per_user.sql` — data cleanup + unique partial index
- `04_script/apps/api/src/bankAccounts.ts` — `disableOtherActiveBanks` helper
- `04_script/apps/api/src/routes/admin.ts` — member banks PUT rejects >1 active; disables others
- `04_script/apps/api/src/partner/routes.ts` — upsert keeps newest active only
- `04_script/apps/web/src/portals/shared/MemberDetailPage.tsx` — UI auto-disables other actives
- `07_manual/02_tether_market_ops.md`
