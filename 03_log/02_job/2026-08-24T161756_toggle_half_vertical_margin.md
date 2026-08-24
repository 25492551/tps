# Toggle: half vertical padding (override button min-height)

**When**: 2026-08-24T161756 UTC

## Summary

Toggle switches were inflated by global `button { min-height: 35px }`. Overrode with `min-height: 0` and height 18px (~half the previous visual), tighter knob.

## Changes

- `04_script/apps/web/src/styles.css` — `.toggle`
