# Admin member popup: editable basic + banks

**When**: 2026-08-21T073437 UTC

## Summary

Admin `/admin/member/:loginId` basic-info and KRW bank sections are editable, each with a Save button at the section top-right. Agent popup remains read-only.

## Changes

- `04_script/apps/api/src/routes/admin.ts` — `PATCH /members/:loginId`, `PUT /members/:loginId/banks`
- `04_script/apps/web/src/portals/shared/MemberDetailPage.tsx` — edit forms + save
- `04_script/apps/web/src/styles.css` — section head / edit grid
- `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
