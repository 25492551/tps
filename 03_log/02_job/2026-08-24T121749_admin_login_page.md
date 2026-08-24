# Admin login page with captcha

**When**: 2026-08-24T121749 UTC

## Summary

Admin sign-in is now `/admin-login` with password and captcha on the same form. `/login` rejects admin accounts. Old `/login/captcha` redirects to the new page.

## Changes

- `04_script/apps/api/src/routes/auth.ts` — `POST /api/auth/admin-login`; `/api/auth/login` blocks admin
- `04_script/apps/api/src/captcha.ts` — drop pending-login tickets; grayscale captcha SVG
- `04_script/apps/web/src/pages/AuthPages.tsx` — `AdminLoginPage`
- `04_script/apps/web/src/App.tsx` — route + admin auth redirect
- `04_script/apps/web/src/lib/auth.tsx` — `loginAdmin`
- `04_script/apps/web/src/lib/api.ts` — portal match `/admin` and `/admin/` only
- `02_layout/03_as_built_ia.md`, `07_manual/01_local_run.md`, `07_manual/02_tether_market_ops.md`
