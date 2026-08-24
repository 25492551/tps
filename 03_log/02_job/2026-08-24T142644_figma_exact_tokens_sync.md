# Sync chrome CSS to Figma exact numbers

**When**: 2026-08-24T142644 UTC

## Summary

Pulled spacing, type, colors, and shadows from Figma `Admin / rates — editable` into CSS tokens/rules (px-accurate).

## Key values

- Header: h 64, gap 74, pad 0/28/0/18, shadow 0 3 6 / 25%
- Brand: 19px SemiBold, tracking 4%
- Topbar label 12/15 Bold Inter; chip pad 6×10, gap 6, value 15/20, unit 13/17
- Side: w 240, pad 20×18, glow → #383838 stops as in Figma
- Nav: gap 2, item pad 8×10, 14/19, active gradient 12%→6%→0
- Footer: gap 12, 13px white
- Main: #b0b0b0, pad 0/28/32/28
- Title 28/39; sub 13/18; panel pad 16, gap 12, h3 16/22
- Input #1a1a1a pad 8×10 r2 h36; btn pad 8×14 r2 h35
- Divider shadow on panels/header only (page-sub no longer fakes a divider)

## Changes

- `04_script/apps/web/src/styles.css`
- `04_script/apps/web/src/portals/{admin,user,agent}/*Shell.tsx` (footer gap)
