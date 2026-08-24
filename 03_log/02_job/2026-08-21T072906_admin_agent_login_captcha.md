# Admin/agent login captcha

**When**: 2026-08-21T072906 UTC

## Summary

Password login for **admin** and **agent** now requires a one-time SVG captcha (자동 접속 방지 문자). Member handoff is unchanged; member `/login` still shows the field but server does not enforce match.

## Changes

- `04_script/apps/api/src/captcha.ts` — issue/consume in-memory captcha
- `04_script/apps/api/src/routes/auth.ts` — `GET /api/auth/captcha`; login verifies for admin/agent
- `04_script/apps/web/src/pages/AuthPages.tsx` — captcha image + input + refresh
- `04_script/apps/web/src/lib/auth.tsx` — pass captcha on login
- `04_script/apps/web/src/styles.css` — captcha layout
- `07_manual/01_local_run.md`, `07_manual/02_tether_market_ops.md`, `02_layout/03_as_built_ia.md`
