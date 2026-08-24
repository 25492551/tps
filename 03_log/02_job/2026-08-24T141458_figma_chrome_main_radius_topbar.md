# Align chrome with Figma (main bg, radius 2, topbar)

**When**: 2026-08-24T141458 UTC

## Summary

Matched portal chrome to edited Figma admin/rates: main area `#383838`, control/chip/badge `border-radius: 2px`, topbar stat groups with wider spacing and Figma-like label/value typography.

## Changes

- `04_script/apps/web/src/styles.css` — `--bg-main`, `--radius: 2px`, header/topbar/main
- `04_script/apps/web/src/portals/{admin,user,agent}/*Shell.tsx` — `.admin-topbar-stat` wrappers
