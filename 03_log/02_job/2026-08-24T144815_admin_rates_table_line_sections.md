# Admin rates: keep table + line sections

**When**: 2026-08-24T144815 UTC

## Summary

Restored `/admin/rates` provider list as a **table** (product override). Kept Figma-style section chrome: transparent panels separated by bottom border lines only. Documented that Figma frame `22:6` still shows cards — table is intentional.

## Changes

- `04_script/apps/web/src/portals/admin/pages.tsx` — rate sources table again
- `04_script/apps/web/src/styles.css` — `.rate-table` + `.rate-sources`; keep `.rate-card` for other pages
- `07_manual/02_tether_market_ops.md` — rates = table + line dividers
