# Admin notify volume setting

**When**: 2026-08-19T115158 UTC

## Summary

`/admin/settings` OTC alert prefs include volume slider (0–100%). Applied to Web Audio playback; stored in localStorage.

## Changes

- `04_script/apps/web/src/lib/adminNotify.ts` — `volume` pref + gain scale
- `04_script/apps/web/src/portals/admin/pages.tsx` — volume range input
- `07_manual/02_tether_market_ops.md`
