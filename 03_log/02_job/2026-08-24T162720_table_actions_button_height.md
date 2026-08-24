# Job: Table action buttons — uniform height

**When (UTC)**: 2026-08-24T162720

## Summary

Fixed inconsistent action button heights in admin table rows (notably `/admin/solution-keys`) by giving `.table-actions button` a fixed height with flex centering and overriding the global `min-height: 35px`.

## Changes

- `04_script/apps/web/src/styles.css` — `.table-actions button`: `height: 1.75rem`, `min-height: 0`, `inline-flex` centering, `line-height: 1`, horizontal-only padding.
