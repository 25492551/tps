# Job: Separate admin/user session tokens and WebSockets

**When**: 2026-08-11T061635 UTC

## Summary

Admin and user sessions no longer share one browser token. User JWT lives in `tps_token_user` (API + `/api/ws/user`); admin JWT in `tps_token_admin` (API + `/api/ws/admin`). Logout on one portal leaves the other intact. Multi-account browser lock ignores admin JWTs.

## Changes

- `04_script/apps/web/src/lib/api.ts` — portal token keys, `resolvePortal`, `wsUrl`
- `04_script/apps/web/src/lib/auth.tsx` — dual sessions; path-scoped `user`
- `04_script/apps/web/src/App.tsx` — RequireAuth uses portal-specific session
- `04_script/apps/web/src/portals/{user,admin}/*` — portal logout; user WS via `/api/ws/user`
- `04_script/apps/api/src/ws.ts` — `/api/ws/user` + `/api/ws/admin` (+ legacy `/api/ws`)
- `04_script/apps/api/src/routes/auth.ts` — lock check skips admin JWT
- `dictionary.md`, `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
