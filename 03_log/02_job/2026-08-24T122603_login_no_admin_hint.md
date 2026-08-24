# Hide admin-login hint on /login

**When**: 2026-08-24T122603 UTC

## Summary

`/login` no longer links to or mentions `/admin-login`. Admin credentials on the member login API fail as a generic invalid password.

## Changes

- `04_script/apps/web/src/pages/AuthPages.tsx` — remove admin-login link
- `04_script/apps/api/src/routes/auth.ts` — 401 `Invalid login id or password` for admin on `/api/auth/login`
- `07_manual/02_tether_market_ops.md` — drop user-facing redirect wording
