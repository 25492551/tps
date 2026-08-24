# Member popup: same-monitor position

**When**: 2026-08-21T073057 UTC

## Summary

Member detail `window.open` now sets `left`/`top` from the opener’s `screenX`/`screenY` so the popup opens centered on the same monitor (including negative coords for left-side displays).

## Changes

- `04_script/apps/web/src/lib/memberWindow.ts`
