# Admin login captcha separate page

## Summary

Admin password login no longer shows captcha on `/login`. After password OK, API returns a short-lived ticket and the UI opens `/login/captcha`. Captcha success issues the admin JWT. Agent and member login skip captcha.

## Changes

- `04_script/apps/api/src/captcha.ts` — pending admin login tickets
- `04_script/apps/api/src/routes/auth.ts` — login returns `needsCaptcha` for admin; `POST /api/auth/login/captcha`
- `04_script/apps/web/src/pages/AuthPages.tsx` — `LoginCaptchaPage`; login form without captcha
- `04_script/apps/web/src/lib/auth.tsx` — login return type for captcha step
- `04_script/apps/web/src/App.tsx` — route `/login/captcha`
- `02_layout/03_as_built_ia.md`, `07_manual/01_local_run.md`, `07_manual/02_tether_market_ops.md`
