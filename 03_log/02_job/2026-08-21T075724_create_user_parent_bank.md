# Create user: parent select, bank fields, checkbox align

**When**: 2026-08-21T075724 UTC

## Summary

Admin “회원 추가” modal: agent can select 상부 (parent partner); KRW bank fields optional; buy/sell checkbox alignment fixed (checkbox was `width:100%`).

## Changes

- `04_script/apps/api/src/routes/admin.ts` — `parentPartnerId`, optional `bank` on POST `/users`
- `04_script/apps/web/src/portals/admin/pages.tsx` — create form fields
- `04_script/apps/web/src/styles.css` — `.member-check` / `.perm-check-row` / bank block
