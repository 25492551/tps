# Job: Admin user loginId → transactions filter

**When**: 2026-08-19T092247 UTC

## Summary

Admin users table: click member login id → `/admin/transactions?loginId=…` with that filter applied. Transactions API accepts `loginId`; list shows login ids.

## Changes

- `04_script/apps/api/src/routes/admin.ts` — `loginId` query + join `login_id`
- `04_script/apps/web/src/portals/admin/pages.tsx` — link + URL-synced filter
- `04_script/apps/web/src/styles.css` — table link accent
