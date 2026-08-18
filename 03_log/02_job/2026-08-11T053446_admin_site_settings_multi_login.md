# Job: Admin site settings — multi-account browser login toggle

**When**: 2026-08-11T053446 UTC

## Summary

Added admin **사이트 설정** with ON/OFF for same-browser multi-account login. When off, login/register blocked if browser already locked to another user (admins exempt). Deployed to `bgp-001.com`.

## Changes

- `04_script/db/004_site_settings.sql`
- `04_script/apps/api/src/settings.ts`, `routes/auth.ts`, `routes/admin.ts`
- `04_script/apps/web` — `/admin/settings`, toggle UI, browser user lock in localStorage
- `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
