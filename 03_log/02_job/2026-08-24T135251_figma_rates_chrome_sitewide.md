# Site chrome: match Figma admin/rates

**When**: 2026-08-24T135251 UTC

## Summary

Applied the edited Figma Admin / rates layout site-wide: top header (brand + stats), sidebar nav with right-edge glow and active gradient, Inter body + Noto Serif KR for brand/numbers, achromatic chips in the header.

## Changes

- `04_script/apps/web/src/portals/shared/ShellLayout.tsx` — `topbar` prop; shell-header + shell-body
- `04_script/apps/web/src/portals/{admin,user,agent}/*Shell.tsx` — stats via `topbar`
- `04_script/apps/web/src/styles.css` — fonts, chrome, nav, header stats
- `02_layout/03_as_built_ia.md`, `07_manual/02_tether_market_ops.md`
