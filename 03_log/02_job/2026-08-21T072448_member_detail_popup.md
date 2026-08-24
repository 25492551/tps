# Member detail popup (admin / agent)

**When**: 2026-08-21T072448 UTC

## Summary

Clicking a member login id on admin and agent pages opens a dedicated window with three tabs: 기본정보, 머니트랜잭션, 접속기록. Login and partner handoff now append rows to `user_access_logs` (history starts after deploy).

## Changes

- `04_script/db/020_user_access_logs.sql` — access log table
- `04_script/apps/api/src/accessLog.ts` — record helper
- `04_script/apps/api/src/routes/auth.ts` — log login / handoff
- `04_script/apps/api/src/routes/admin.ts` — `/members/:loginId` profile, tx, access-logs
- `04_script/apps/api/src/routes/agent.ts` — same scoped to partner members
- `04_script/apps/web/src/portals/shared/MemberDetailPage.tsx` — popup UI
- `04_script/apps/web/src/lib/memberWindow.ts` — `window.open` helper
- `04_script/apps/web/src/App.tsx`, `styles.css` — routes + popup styles
- Admin/agent list pages — login id opens popup
- `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
