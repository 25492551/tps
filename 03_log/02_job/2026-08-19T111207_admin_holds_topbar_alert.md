# Admin holds top bar + alert sound

**When**: 2026-08-19T111207 UTC

## Summary

Admin shell shows pending OTC holds count in a top bar (and nav badge). Polls every 8s; new pending trades trigger a configurable browser alert sound. Site settings adds OTC alert prefs (sound, repeat count) stored in localStorage.

## Changes

- `04_script/apps/api/src/routes/admin.ts` — `GET /api/admin/holds/pending`
- `04_script/apps/web/src/lib/adminNotify.ts` — prefs + Web Audio alert patterns
- `04_script/apps/web/src/portals/admin/AdminShell.tsx` — top bar, poll, alert
- `04_script/apps/web/src/portals/admin/pages.tsx` — settings OTC alert section
- `04_script/apps/web/src/styles.css` — top bar / badge styles
- `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
